import random
import sys
import os
from types import SimpleNamespace
import time
import json
from queue import Queue, Empty
from threading import Thread, Lock
from uuid import uuid4

import torch
from api_client import AIBrushAPI
import base64
import traceback
from PIL import Image
import argparse
from io import BytesIO

# import clip_rank
from clip_process import ClipProcess
from model_process import ModelProcess
# from sd_text2im_model import StableDiffusionText2ImageModel, load_model as load_sd_model
# from swinir_model import SwinIRModel
# from glid_3_xl_model import generate_model_signature
from memutil import get_free_memory
from torch import device
from apisocket import ApiSocket
import asyncio

NOTIFICATION_PENDING_IMAGE = "pending_image"
NOTIFICATION_WORKER_CONFIG_UPDATED = "worker_config_updated"

api_url = "https://www.aibrush.art"
if len(sys.argv) > 1:
    api_url = sys.argv[1]
if os.path.exists("credentials.json"):
    print("Loading credentials from credentials.json")
    # load credentials.json
    with open('credentials.json') as f:
        access_token = json.load(f)["accessToken"]
        client = AIBrushAPI(api_url, access_token)
elif os.environ.get("WORKER_LOGIN_CODE"):
    print("Logging in with login code")
    client = AIBrushAPI(api_url, None, os.environ["WORKER_LOGIN_CODE"])
else:
    raise Exception("No credentials.json or WORKER_LOGIN_CODE environment variable found")

def get_worker_id():
    token = client.token
    parts = token.split(".")
    if len(parts) != 3:
        raise Exception("Invalid token")
    payload = json.loads(base64.b64decode(parts[1] + "=="))
    print(payload)
    return payload["serviceAccountConfig"]["workerId"]

WORKER_ID = get_worker_id()

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
    init_image_path = os.path.join("images", image.id + "-init.png")
    output_image_path = os.path.join("images", image.id + ".png")
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
    args.filename = image.id + ".png"
    args.ddim_steps = image.iterations
    if image.model == "stable_diffusion_text2im":
        args.strength = image.stable_diffusion_strength
    args.image = None
    if image_data:
        # save image
        with open(os.path.join("images", image.id + "-init.png"), "wb") as f:
            f.write(image_data)
        args.image = os.path.join("images", image.id + "-init.png")
    if mask_data:
        # save mask
        with open(os.path.join("images", image.id + "-mask.png"), "wb") as f:
            f.write(mask_data)
        args.mask = os.path.join("images", image.id + "-mask.png")
    return args

model_lock = Lock()

# model_name: str = None
# model = None
# clip_ranker = None

def get_clip_ranker(gpu: str):
    with model_lock:
        return ClipProcess(gpu)

def create_model(model_name: str, gpu: str):
    print("create_model", model_name, gpu)
    with model_lock:
        print("lock acquired")
        if model_name == "swinir":
            return ModelProcess("swinir_model.py", gpu)
        elif model_name == "stable_diffusion_text2im":
            return ModelProcess("sd_text2im_model.py", gpu)
        elif model_name == "stable_diffusion_inpainting":
            return ModelProcess("sd_inpaint_model.py", gpu)
        else:
            raise Exception(f"Unknown model name: {model_name}")

# def clear_model():
#     global model
#     model = None

def metric(name: str, type: str, value: any, attributes: dict = None) -> SimpleNamespace:
    attribute_list = []
    if attributes:
        for key, v in attributes.items():
            attribute_list.append({"name": key, "value": v})
    return SimpleNamespace(name=name, type=type, value=value, attributes=attribute_list)

def get_model_assignment(gpu: str)-> str:
    gpu_num = int(gpu.split(":")[1])
    worker_config = client.get_worker_config(WORKER_ID)
    gpu_config = worker_config.gpu_configs[gpu_num]
    model_name = gpu_config.model
    return model_name

def poll_loop(ready_queue: Queue, process_queue: Queue, metrics_queue: Queue, websocket_queue: Queue, gpu: str):
    last_model_check = time.time()
    image = None

    model_name = get_model_assignment(gpu)

    image = warmup_image(model_name, str(uuid4()))
    process_queue.put(image)
    ready_queue.get()

    while True:
        try:
            start = time.time()
            message = None
            pending_image = False
            config_updated = False
            try:
                message = websocket_queue.get(timeout=0.1)
            except Empty:
                pass
            if message:
                message = json.loads(message)
                if "connected" in message and message["connected"]:
                    print("Connected to websocket")
                else:
                    message = SimpleNamespace(**message)
                    if message.type == NOTIFICATION_PENDING_IMAGE:
                        pending_image = True
                        # worker jitter. All workers are notified at once,
                        # so we wait a random amount of time before trying to process
                        # the next image
                        time.sleep(random.random() * 0.5)
                    elif message.type == NOTIFICATION_WORKER_CONFIG_UPDATED:
                        config_updated = True
            if config_updated or time.time() - last_model_check > 60:
                last_model_check = time.time()
                current_model_name = get_model_assignment(gpu)
                if current_model_name != model_name:
                    print("Model changed from", model_name, "to", current_model_name)
                    model_name = current_model_name
                    image = warmup_image(model_name, str(uuid4()))
            elif image or pending_image:
                image = client.process_image(model_name)
                metrics_queue.put(metric("worker.poll", "count", 1, {
                    "duration_seconds": time.time() - start,
                    "sticky": True,
                }))
            if image:
                if not image.warmup:
                    image_download_urls = client.get_image_download_urls(image.id)
                    print("image urls", image_download_urls)
                    image.image_data = client.get_image_data(image.id, image_download_urls.image_url)
                    image.mask_data = None
                    if image.model == "stable_diffusion_inpainting":
                        image.mask_data = client.get_mask_data(image.id, image_download_urls.mask_url)
                process_queue.put(image)
                if image.warmup:
                    ready_queue.get()
        except Exception as err:
            print(f"Pool Loop Error: {err}")
            traceback.print_exc()
            continue

def blank_image_data():
    img = Image.new("RGB", (512, 512), (255, 255, 255))
    # convert to base64 encoded png
    buf = BytesIO()
    img.save(buf, format="png")
    return buf.getvalue()

def warmup_image(model_name: str, image_id: str):
    image_data = None
    mask_data = None
    if model_name == "stable_diffusion_inpainting":
        mask_data = blank_image_data()
        image_data = blank_image_data()
    elif model_name == "swinir":
        image_data = blank_image_data()
    return SimpleNamespace(
        id=image_id,
        phrases=["a cat"],
        height=512,
        width=512,
        iterations=10,
        stable_diffusion_strength=0.75,
        model=model_name,
        image_data=image_data,
        mask_data=mask_data,
        warmup=True,
        nsfw=False,
    )

def process_loop(ready_queue: Queue, process_queue: Queue, update_queue: Queue, metrics_queue: Queue, gpu: str):
    print("process loop started")
    model_name = None
    clip_ranker = get_clip_ranker(gpu)
    while True:
        try:
            image = process_queue.get()
            if not image:
                return
            start = time.time()
            image_data = image.image_data
            mask_data = image.mask_data

            def update_image(iterations: int, status: str, nsfw: bool = False):
                if image.warmup:
                    return
                score = 0
                negative_score = 0
                image_data = None
                npy_data = None
                # get output image
                image_path = os.path.join("images", image.id + ".png")
                if image.model == "swinir" and os.path.exists(image_path):
                    img = Image.open(image_path)
                    # resize image
                    img = img.resize((image.width, image.height), Image.ANTIALIAS)
                    img.save(image_path)

                if os.path.exists(image_path):
                    prompts = "|".join(image.phrases)
                    negative_prompts = "|".join(image.negative_phrases).strip()
                    print(f"Calculating clip ranking for '{prompts}'")
                    score = clip_ranker.rank(argparse.Namespace(text=prompts, image=image_path, cpu=False))
                    if negative_prompts:
                        print(f"Calculating negative clip ranking for '{prompts}'")
                        negative_score = clip_ranker.rank(argparse.Namespace(text=negative_prompts, image=image_path, cpu=False))
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
            elif image.model == "stable_diffusion_inpainting":
                args = _sd_args(image_data, mask_data, None, image)

            if image.model != model_name:
                model_name = image.model
                model = None
                model = create_model(model_name, gpu)

            update_image(0, "processing")

            nsfw = model.generate(args)
            nsfw = nsfw or image.nsfw # inherit nsfw from parent

            update_image(image.iterations, "completed", nsfw)
            metrics_queue.put(metric("worker.process", "count", 1, {
                "duration_seconds": time.time() - start,
                "nsfw": nsfw,
                "model": image.model,
            }))
            if image.warmup:
                ready_queue.put(True)
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
            client.update_image(image.id, image.image_data, image.iterations, image.status, image.score, image.negative_score, image.nsfw)
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

class ImagesWorker:
    def __init__(self, gpu: str):
        # create queues
        self.websocket_queue = Queue(maxsize=1)
        self.process_queue = Queue(maxsize=1)
        self.update_queue = Queue(maxsize=1)
        self.cleanup_queue = Queue(maxsize=1)
        self.metrics_queue = Queue(maxsize=1)
        self.ready_queue = Queue(maxsize=1)

        # start threads
        self.apisocket = ApiSocket(api_url, client.token, self.websocket_queue)
        # self.websocket_thread = Thread(target=self.apisocket.run)
        self.websocket_thread = Thread(target=asyncio.run, args=(self.apisocket.run(),))
        self.poll_thread = Thread(target=poll_loop, args=(self.ready_queue, self.process_queue, self.metrics_queue, self.websocket_queue, gpu))
        self.process_thread = Thread(target=process_loop, args=(self.ready_queue, self.process_queue, self.update_queue, self.metrics_queue, gpu))
        self.update_thread = Thread(target=update_loop, args=(self.update_queue, self.cleanup_queue, self.metrics_queue))
        self.cleanup_thread = Thread(target=cleanup_loop, args=(self.cleanup_queue,))
        self.metrics_thread = Thread(target=metrics_loop, args=(self.metrics_queue,))

    def start(self):
        # start threads
        self.websocket_thread.start()
        self.poll_thread.start()
        self.update_thread.start()
        self.cleanup_thread.start()
        self.metrics_thread.start()
        self.process_thread.start()
    
    def wait(self):
        self.process_thread.join()
        self.websocket_thread.join()
        self.poll_thread.join()
        self.update_thread.join()
        self.cleanup_thread.join()
        self.metrics_thread.join()

if __name__ == "__main__":
    device_count = torch.cuda.device_count()
    for i in range(device_count):
        print(f"Device {i}: {torch.cuda.get_device_name(i)}")
        worker = ImagesWorker(f"cuda:{i}")
        worker.start()
    worker.wait()
