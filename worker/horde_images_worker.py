import random
import sys
import os
from types import SimpleNamespace
import time
import json
from queue import Queue, Empty
from threading import Thread, Lock
from uuid import uuid4
import requests

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
import bugsnag
from errorkillswitch import ErrorKillSwitch

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
    raise Exception(
        "No credentials.json or WORKER_LOGIN_CODE environment variable found")

bugsnag_api_key = client.get_bugsnag_api_key()
bugsnag.configure(api_key=bugsnag_api_key, project_root=".")

killswitch = ErrorKillSwitch()
_killswitch_lock = Lock()


def on_kill(listener: callable):
    with _killswitch_lock:
        killswitch.on_kill(listener)


def handle_error(err, context: str):
    print(f"Error in {context}: {err}")
    traceback.print_exc()
    bugsnag.notify(err, context=context)
    killswitch.add_error()


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
        _cleanup_file(image_id, os.path.join("images", fname))
    for fname in os.listdir("output"):
        _cleanup_file(image_id, os.path.join("output", fname))
    for fname in os.listdir("output_npy"):
        _cleanup_file(image_id, os.path.join("output_npy", fname))
    if os.path.exists("results"):
        for fname in os.listdir(os.path.join("results", "swinir_real_sr_x4")):
            _cleanup_file(image_id, os.path.join(
                "results", "swinir_real_sr_x4", fname))


def _cleanup_file(image_id: str, file_path: str):
    is_old = time.time() - os.path.getmtime(file_path) > 3600
    match = image_id in file_path
    if is_old or match:
        try:
            os.remove(file_path)
        except:
            # another thread might have deleted it
            pass


def metric(name: str, type: str, value: any, attributes: dict = None) -> SimpleNamespace:
    attribute_list = []
    if attributes:
        for key, v in attributes.items():
            attribute_list.append({"name": key, "value": v})
    return SimpleNamespace(name=name, type=type, value=value, attributes=attribute_list)


_triggers = {
    "GTA5 Artwork Diffusion": "gtav style",
    "colorbook": "in VARPJ1 Coloring Book Art Style",
    "Future Diffusion": "future style",
}


def add_trigger(prompt: str, model: str) -> str:
    if model in _triggers:
        trigger = _triggers[model]
        if trigger.lower() not in prompt.lower():
            return f"{trigger}, {prompt}"
    return prompt


def poll_loop(ready_queue: Queue, process_queue: Queue, metrics_queue: Queue, websocket_queue: Queue):
    last_model_check = time.time()
    image = None

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
                    print("received message", message)
                    message = SimpleNamespace(**message)
                    if message.type == NOTIFICATION_PENDING_IMAGE:
                        pending_image = True
                        # worker jitter. All workers are notified at once,
                        # so we wait a random amount of time before trying to process
                        # the next image
                        time.sleep(random.random() * 0.5)
                    elif message.type == NOTIFICATION_WORKER_CONFIG_UPDATED:
                        config_updated = True
            # poll interval has been changed to every 2 seconds because websocket isn't working anymore
            if config_updated or time.time() - last_model_check > 2:
                client.worker_ping()
                last_model_check = time.time()

                image = client.process_image(exclude_models=["swinir"])
                metrics_queue.put(metric("worker.poll", "count", 1, {
                    "duration_seconds": time.time() - start,
                }))
            elif image or pending_image:
                image = client.process_image(exclude_models=["swinir"])
                metrics_queue.put(metric("worker.poll", "count", 1, {
                    "duration_seconds": time.time() - start,
                }))
            if image:
                image.thumbnail_data = None
                if not image.warmup:
                    image_download_urls = client.get_image_download_urls(
                        image.id)
                    image.image_data = client.get_image_data(
                        image.id, image_download_urls.image_url)
                    image.mask_data = None
                    if image.model == "stable_diffusion_inpainting":
                        image.mask_data = client.get_mask_data(
                            image.id, image_download_urls.mask_url)
                process_queue.put(image)
                if image.warmup:
                    ready_queue.get()
                image = None
        except Exception as err:
            handle_error(err, "poll_loop")

            continue


STABLE_HORDE_API_KEY = os.environ.get("STABLE_HORDE_API_KEY")

blacklisted_terms = [
    "loli"
]

blacklisted_nsfw_terms = [
    "child",
    "teen",
    "girl",
    "boy",
    "young",
    "underage",
    "infant",
    "baby"
]

def strip_blacklisted_terms(nsfw: bool, prompt: str)->str:
    prompt = prompt.lower()
    for term in blacklisted_terms:
        prompt = prompt.replace(term, "")
    if nsfw:
        for term in blacklisted_nsfw_terms:
            prompt = prompt.replace(term, "")
    return prompt

def process_image(image):
    prompt = add_trigger(",".join(image.phrases), image.model)
    negative_prompt = ",".join(image.negative_phrases)
    if len(negative_prompt) > 0:
        prompt = prompt + " ### " + negative_prompt
    prompt = strip_blacklisted_terms(image.nsfw, prompt)
    payload = {
        "params": {
            "n": 1,
            "width": image.width,
            "height": image.height,
            "steps": image.iterations,
            "sampler_name": "k_euler",
            "cfg_scale": 7.5,
            "denoising_strength": image.stable_diffusion_strength,
        },
        "prompt": prompt,
        "api_key": STABLE_HORDE_API_KEY,
        "nsfw": image.nsfw,
        "censor_nsfw": not image.nsfw,
        "trusted_workers": False,
        "r2": True,
        "models": [image.model],
        "source_processing": "img2img",
    }
    if image.image_data:
        png_image = Image.open(BytesIO(image.image_data))
        buffer = BytesIO()
        png_image.save(buffer, format="Webp", quality=95)
        payload["source_image"] = base64.b64encode(
            buffer.getvalue()).decode("utf-8")
    if image.mask_data:
        png_mask = Image.open(BytesIO(image.mask_data))
        buffer = BytesIO()
        png_mask.save(buffer, format="Webp", quality=95)
        payload["source_mask"] = base64.b64encode(
            buffer.getvalue()).decode("utf-8")
        payload["source_processing"] = "inpainting"
    headers = {"apiKey": STABLE_HORDE_API_KEY}

    # Submit job
    submit_req = requests.post(
        f'https://stablehorde.net/api/v2/generate/async', json=payload, headers=headers)
    if not submit_req.ok:
        print("horde submit failed", submit_req.text)
        bugsnag.notify(
            Exception("horde submit failed"),
            context="process_image",
            metadata={
                "prompt": prompt,
                "created_by": image.created_by,
                "image_id": image.id,
            }
        )
        return None

    # poll for status and retrieve image
    submit_results = submit_req.json()
    req_id = submit_results["id"]
    is_done = False
    retry = 0
    while not is_done:
        try:
            chk_req = requests.get(
                f'https://stablehorde.net/api/v2/generate/check/{req_id}')
            if not chk_req.ok:
                print(chk_req.text)
                return None
            chk_results = chk_req.json()
            print(chk_results)
            is_done = chk_results['done']
            time.sleep(0.8)
        except ConnectionError as e:
            retry += 1
            print(f"Error {e} when retrieving status. Retry {retry}/10")
            if retry < 10:
                time.sleep(1)
                continue
            raise
    retrieve_req = requests.get(
        f'https://stablehorde.net/api/v2/generate/status/{req_id}')
    if not retrieve_req.ok:
        print(retrieve_req.text)
        return
    results_json = retrieve_req.json()
    if results_json['faulted']:
        final_submit_dict = payload
        if "source_image" in final_submit_dict:
            final_submit_dict[
                "source_image"] = f"img2img request with size: {len(final_submit_dict['source_image'])}"
        print(
            f"Something went wrong when generating the request. Please contact the horde administrator with your request details: {final_submit_dict}")
        return None
    # TODO: maybe support batch size > 1 later
    result = results_json["generations"][0]
    webp_image_data = requests.get(result["img"]).content
    webp_image = Image.open(BytesIO(webp_image_data))
    buffer = BytesIO()
    webp_image.save(buffer, format="PNG")
    image.image_data = buffer.getvalue()
    return image


def process_loop(ready_queue: Queue, process_queue: Queue, update_queue: Queue, metrics_queue: Queue):
    print("process loop started")

    while True:
        try:
            image = process_queue.get()
            if not image:
                return
            start = time.time()

            def update_image(iterations: int, status: str, image_data: bytes = None):
                if image.warmup:
                    return
                score = 0
                negative_score = 0
                # image_data = None
                thumbnail_data = None
                npy_data = None

                if image_data:
                    # use PIL to resize image
                    thumbnail = Image.open(BytesIO(image_data))
                    # resize image
                    thumbnail = thumbnail.resize((128, 128), Image.ANTIALIAS)
                    # thumbnail = Image.lo(image_data).resize((128, 128), Image.ANTIALIAS)
                    buf = BytesIO()
                    thumbnail.save(buf, format="png")
                    thumbnail_data = base64.b64encode(
                        buf.getvalue()).decode("utf-8")
                    # base64 encode image
                    image_data = base64.encodebytes(image_data).decode("utf-8")
                # update image
                # client.update_image(image.id, image_data, npy_data, iterations, status, score, negative_score, nsfw)
                update_queue.put(SimpleNamespace(
                    id=image.id,
                    image_data=image_data,
                    thumbnail_data=thumbnail_data,
                    npy_data=npy_data,
                    iterations=iterations,
                    status=status,
                    score=score,
                    negative_score=negative_score,
                    nsfw=image.nsfw,
                ))

            update_image(0, "processing")

            updated_image = process_image(image)
            if not updated_image:
                update_image(image.iterations, "error")
                continue

            update_image(image.iterations, "completed", image.image_data)
            metrics_queue.put(metric("worker.process", "count", 1, {
                "duration_seconds": time.time() - start,
                "model": image.model,
            }))
            if image.warmup:
                ready_queue.put(True)
        except Exception as e:
            handle_error(e, "process_loop")
            continue


def update_loop(update_queue: Queue, cleanup_queue: Queue, metrics_queue: Queue):
    while True:
        try:
            image = update_queue.get()
            if not image:
                return
            start = time.time()
            client.update_image(image.id, image.image_data, image.thumbnail_data,
                                image.iterations, image.status, image.score, image.negative_score, image.nsfw)
            metrics_queue.put(metric("worker.update", "count", 1, {
                "duration_seconds": time.time() - start
            }))
            # cleanup_queue.put(image.id)
            if image.status == "completed":
                cleanup_queue.put(image.id)
        except Exception as e:
            handle_error(e, "update_loop")
            continue


def cleanup_loop(cleanup_queue: Queue):
    while True:
        try:
            image_id = cleanup_queue.get()
            if not image_id:
                return
            cleanup(image_id)
        except Exception as e:
            handle_error(e, "cleanup_loop")
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
            handle_error(e, "metrics_loop")
            continue


PROCESS_THREADS = 30


class ImagesWorker:
    def __init__(self):
        # create queues
        self.websocket_queue = Queue(maxsize=1)
        self.process_queue = Queue(maxsize=4)
        self.update_queue = Queue(maxsize=4)
        self.cleanup_queue = Queue(maxsize=4)
        self.metrics_queue = Queue(maxsize=4)
        self.ready_queue = Queue(maxsize=1)

        # start threads
        self.apisocket = ApiSocket(api_url, client.token, self.websocket_queue)
        # self.websocket_thread = Thread(target=self.apisocket.run)
        self.websocket_thread = Thread(
            target=asyncio.run, args=(self.apisocket.run(),))
        self.poll_thread = Thread(target=poll_loop, args=(
            self.ready_queue, self.process_queue, self.metrics_queue, self.websocket_queue))
        # self.process_thread = Thread(target=process_loop, args=(
        #     self.ready_queue, self.process_queue, self.update_queue, self.metrics_queue))
        self.process_threads = []
        for i in range(PROCESS_THREADS):
            self.process_threads.append(Thread(target=process_loop, args=(
                self.ready_queue, self.process_queue, self.update_queue, self.metrics_queue)))
        self.update_thread = Thread(target=update_loop, args=(
            self.update_queue, self.cleanup_queue, self.metrics_queue))
        self.cleanup_thread = Thread(
            target=cleanup_loop, args=(self.cleanup_queue,))
        self.metrics_thread = Thread(
            target=metrics_loop, args=(self.metrics_queue,))

    def start(self):
        # start threads
        self.websocket_thread.start()
        self.poll_thread.start()
        self.update_thread.start()
        self.cleanup_thread.start()
        self.metrics_thread.start()
        # self.process_thread.start()
        for process_thread in self.process_threads:
            process_thread.start()

    def wait(self):
        # self.process_thread.join()
        for process_thread in self.process_threads:
            process_thread.join()
        self.websocket_thread.join()
        self.poll_thread.join()
        self.update_thread.join()
        self.cleanup_thread.join()
        self.metrics_thread.join()

    def kill(self):
        self.apisocket.kill()
        self.websocket_queue.put(None)
        # self.process_queue.put(None)
        for i in range(PROCESS_THREADS):
            self.process_queue.put(None)
        self.update_queue.put(None)
        self.cleanup_queue.put(None)
        self.metrics_queue.put(None)
        self.ready_queue.put(None)


if __name__ == "__main__":
    worker = ImagesWorker()
    worker.start()
