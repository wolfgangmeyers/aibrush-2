import random
import sys
import os
from types import SimpleNamespace
import time
import json
from queue import Queue
from threading import Thread

from torch import rand
from api_client import AIBrushAPI
import base64
import traceback
from PIL import Image
import argparse
from io import BytesIO

import clip_process
from model_process import ModelProcess
# from glid_3_xl_model import generate_model_signature
from memutil import get_free_memory


api_url = "https://www.aibrush.art"
if len(sys.argv) > 1:
    api_url = sys.argv[1]

# load credentials.json
with open('credentials.json') as f:
    access_token = json.load(f)["accessToken"]

zoom_supported = True

client = AIBrushAPI(api_url, access_token)

# create an 'images' folder if it doesn't exist
for folder in ["images", "output", "output_npy"]:
    if not os.path.exists(folder):
        os.makedirs(folder)

def cleanup(image_id: str):
    # delete all files in the current folder ending in .png or .backup
    for fname in os.listdir("images"):
        if image_id in fname:
            os.remove(os.path.join("images", fname))
    for fname in os.listdir("output"):
        if image_id in fname:
            os.remove(os.path.join("output", fname))
    for fname in os.listdir("output_npy"):
        if image_id in fname:
            os.remove(os.path.join("output_npy", fname))
    # TODO: image-specific paths for video frames
    # if os.path.exists("steps"):
    #     for fname in os.listdir("steps"):
    #         os.remove(os.path.join("steps", fname))
    if os.path.exists("results"):
        for fname in os.listdir(os.path.join("results", "swinir_real_sr_x4")):
            if image_id in fname:
                os.remove(os.path.join("results", "swinir_real_sr_x4", fname))

def _swinir_args(image_data, image):
    # python SwinIR\main_test_swinir.py --task real_sr --model_path 003_realSR_BSRGAN_DFO_s64w8_SwinIR-M_x4_GAN.pth --folder_lq images --scale 4
    if not image_data:
        raise Exception("Image data is required for SwinIR")
    args = SimpleNamespace()
    args.model_path = "003_realSR_BSRGAN_DFO_s64w8_SwinIR-M_x4_GAN.pth"
    # downsampling to 256 width yields better results
    buf = BytesIO(image_data)
    img = Image.open(buf)
    init_image_path = os.path.join("images", image.id + "-init.jpg")
    output_image_path = os.path.join("images", image.id + ".jpg")
    img.save(init_image_path)
    args.init_image = init_image_path
    args.output_image = output_image_path
    return args

def _sd_args(image_data, mask_data, npy_data, image):
    args = SimpleNamespace()
    args.prompt = ",".join(image.phrases)
    args.H = image.height
    args.W = image.width
    # TODO: support reusing previous seeds
    args.seed = random.randint(0, 2**32)
    args.filename = image.id + ".jpg"
    args.ddim_steps = image.iterations
    args.strength = image.stable_diffusion_strength
    args.init_img = None
    if image_data:
        # save image
        with open(os.path.join("images", image.id + "-init.jpg"), "wb") as f:
            f.write(image_data)
        args.init_img = os.path.join("images", image.id + "-init.jpg")
    return args

model_name: str = None
model = None
model_signature: str = None
clip_ranker = None

def get_clip_ranker():
    global clip_ranker
    if clip_ranker is None:
        clip_ranker = clip_process.ClipProcess()
    return clip_ranker

def clear_clip_ranker():
    global clip_ranker
    clip_ranker = None

def create_model():
    global model
    if model_name == "swinir":
        model = ModelProcess("swinir_model.py")
    elif model_name == "stable_diffusion_text2im":
        model = ModelProcess("sd_text2im_model.py")

def clear_model():
    global model
    model = None

def metric(name: str, type: str, value: any, attributes: dict = None) -> SimpleNamespace:
    attribute_list = []
    if attributes:
        for key, v in attributes.items():
            attribute_list.append({"name": key, "value": v})
    return SimpleNamespace(name=name, type=type, value=value, attributes=attribute_list)

def poll_loop(process_queue: Queue, metrics_queue: Queue):
    backoff = 1
    while True:
        try:
            start = time.time()
            image = client.process_image(zoom_supported)
            metrics_queue.put(metric("worker.poll", "count", 1, {
                "duration_seconds": time.time() - start
            }))
            if image:
                backoff = 1
                image.image_data = client.get_image_data(image.id)
                process_queue.put(image)
            else:
                time.sleep(backoff)
                backoff = min(backoff * 2, 10)
        except Exception as e:
            print(f"Pool Loop Error: {e}")
            traceback.print_exc()
            time.sleep(backoff)
            backoff = min(backoff * 2, 10)
            continue

def process_loop(process_queue: Queue, update_queue: Queue, metrics_queue: Queue):
    global clip_ranker
    global model_name, model
    while True:
        try:
            image = process_queue.get()
            if not image:
                return
            start = time.time()
            image_data = image.image_data

            def update_image(iterations: int, status: str, nsfw: bool = False):
                score = 0
                negative_score = 0
                image_data = None
                npy_data = None
                # get output image
                image_path = os.path.join("images", image.id + ".jpg")
                if image.model == "swinir" and os.path.exists(image_path):
                    img = Image.open(image_path)
                    # resize image
                    img = img.resize((image.width, image.height), Image.ANTIALIAS)
                    img.save(image_path)
                    
                if os.path.exists(image_path):
                    # TODO: dedicated clip workers? Add clip to stable diffusion model process?
                    # the code below fails with "No GPUS available" if run from system startup using @reboot in crontab

                    # free_memory = get_free_memory()
                    
                    # # during testing, clip ranking needs at most 4.4 GB of memory (2.4 is not enough)
                    # if free_memory/1e9 < 4.4 and not clip_ranker:
                    #     print("Clearing model to free up memory for clip ranking")
                    #     clear_model()
                    prompts = "|".join(image.phrases)
                    negative_prompts = "|".join(image.negative_phrases).strip()
                    print(f"Calculating clip ranking for '{prompts}'")
                    score = get_clip_ranker().rank(argparse.Namespace(text=prompts, image=image_path, cpu=False))
                    if negative_prompts:
                        print(f"Calculating negative clip ranking for '{prompts}'")
                        negative_score = get_clip_ranker().rank(argparse.Namespace(text=negative_prompts, image=image_path, cpu=False))
                    with open(image_path, "rb") as f:
                        image_data = f.read()
                    # base64 encode image
                    image_data = base64.encodebytes(image_data).decode("utf-8")
                # update image
                # client.update_image(image.id, image_data, npy_data, iterations, status, score, negative_score, nsfw)
                update_queue.put(SimpleNamespace(
                    id=image.id,
                    image_data=image_data,
                    npy_data=npy_data,
                    iterations=iterations,
                    status=status,
                    score=score,
                    negative_score=negative_score,
                    nsfw=nsfw
                ))

            if image.model == "swinir":
                args = _swinir_args(image_data, image)
            elif image.model == "stable_diffusion_text2im":
                args = _sd_args(image_data, None, None, image)

            if image.model != model_name:
                clear_model()
                model_name = image.model
                create_model()

            update_image(0, "processing")

            # TODO: detect memory overflow and clear clip ranker?
            if not model:
                create_model()
            nsfw = model.generate(args)
            nsfw = nsfw or image.nsfw # inherit nsfw from parent

            update_image(image.iterations, "completed", nsfw)
            metrics_queue.put(metric("worker.process", "count", 1, {
                "duration_seconds": time.time() - start,
                "nsfw": nsfw,
            }))
        except Exception as e:
            print(f"Process Loop Error: {e}")
            traceback.print_exc()
            continue

def update_loop(update_queue: Queue, cleanup_queue: Queue, metrics_queue: Queue):
    while True:
        try:
            image = update_queue.get()
            if not image:
                return
            start = time.time()
            client.update_image(image.id, image.image_data, image.npy_data, image.iterations, image.status, image.score, image.negative_score, image.nsfw)
            metrics_queue.put(metric("worker.update", "count", 1, {
                "duration_seconds": time.time() - start
            }))
            # cleanup_queue.put(image.id)
            if image.status == "completed":
                cleanup_queue.put(image.id)
        except Exception as e:
            print(f"Update Loop Error: {e}")
            traceback.print_exc()
            continue

def cleanup_loop(cleanup_queue: Queue):
    while True:
        try:
            image_id = cleanup_queue.get()
            if not image_id:
                return
            cleanup(image_id)
        except Exception as e:
            print(f"Cleanup Loop Error: {e}")
            traceback.print_exc()
            continue

def metrics_loop(metrics_queue: Queue):
    # Collect metrics and send to server every 10 seconds
    last_send = time.time()
    collected_metrics = []
    while True:
        try:
            metrics = metrics_queue.get()
            if not metrics:
                return
            collected_metrics.append(metrics)
            if time.time() - last_send > 10:
                client.add_metrics(collected_metrics)
                collected_metrics = []
                last_send = time.time()
        except Exception as e:
            print(f"Metrics Loop Error: {e}")
            traceback.print_exc()
            continue

if __name__ == "__main__":
    try:
        print("Warming up stable diffusion model")
        # warmup
        model_name = "stable_diffusion_text2im"
        create_model()
        # def _sd_args(image_data, mask_data, npy_data, image):
        args = _sd_args(None, None, None, SimpleNamespace(
            phrases=["a cat"],
            height=512,
            width=512,
            id="warmup",
            iterations=10,
            stable_diffusion_strength=0.75,

        ))
        model.generate(args)
        get_clip_ranker().rank(argparse.Namespace(text="a cat", image="images/warmup.jpg", cpu=False))

        # create queues
        process_queue = Queue(maxsize=1)
        update_queue = Queue(maxsize=1)
        cleanup_queue = Queue(maxsize=1)
        metrics_queue = Queue(maxsize=1)

        # start threads
        poll_thread = Thread(target=poll_loop, args=(process_queue, metrics_queue))
        poll_thread.start()
        process_thread = Thread(target=process_loop, args=(process_queue, update_queue, metrics_queue))
        process_thread.start()
        update_thread = Thread(target=update_loop, args=(update_queue, cleanup_queue, metrics_queue))
        update_thread.start()
        cleanup_thread = Thread(target=cleanup_loop, args=(cleanup_queue,))
        cleanup_thread.start()
        metrics_thread = Thread(target=metrics_loop, args=(metrics_queue,))
        metrics_thread.start()

        # wait for threads to finish
        poll_thread.join()
        process_thread.join()
        update_thread.join()
        cleanup_thread.join()
    except KeyboardInterrupt:
        del model
