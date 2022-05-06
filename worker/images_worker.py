import requests
import sys
import os
from types import SimpleNamespace
import time
import json
from api_client import AIBrushAPI
import base64
import traceback
import subprocess

# from vqgan_clip.generate import run, default_args



api_url = "https://www.aibrush.art"
if len(sys.argv) > 1:
    api_url = sys.argv[1]

# load credentials.json
with open('credentials.json') as f:
    access_token = json.load(f)["accessToken"]

zoom_supported = True
try:
    with open("config.json") as f:
        config = json.load(f)
        if "zoom_supported" in config:
            zoom_supported = config["zoom_supported"]
except:
    pass

client = AIBrushAPI(api_url, access_token)

# create an 'images' folder if it doesn't exist
if not os.path.exists("images"):
    os.makedirs("images")

def cleanup():
    # delete all files in the current folder ending in .png or .backup
    for fname in os.listdir("images"):
        if fname.endswith(".jpg") or fname.endswith(".mp4"):
            os.remove(os.path.join("images", fname))
    if os.path.exists("steps"):
        for fname in os.listdir("steps"):
            os.remove(os.path.join("steps", fname))

def _vqgan_args(image_data, image):
    args = SimpleNamespace()
    if image_data:
        # save image
        with open(os.path.join("images", image.id + "-init.jpg"), "wb") as f:
            f.write(image_data)
        args.init_image = os.path.join("images", image.id + "-init.jpg")
    args.max_iterations = image.iterations
    args.prompts = " | ".join(image.phrases)
    if image.enable_video:
        if image.enable_zoom:
            args.make_zoom_video = True
            args.zoom_frequency = image.zoom_frequency
            args.zoom_scale = image.zoom_scale
            args.zoom_shift_x = image.zoom_shift_x
            args.zoom_shift_y = image.zoom_shift_y
        else:
            args.make_video = True
    args.output = os.path.join("images", image.id + ".jpg")
    args.display_freq = 50
    if args.max_iterations < args.display_freq:
        args.display_freq = args.max_iterations
    # args.on_save_callback = lambda i: update_image(i, "processing")
    if hasattr(image, "model") and image.model == "faces":
        print("Running faces model")
        args.vqgan_config = "checkpoints/faceshq.yaml"
        args.vqgan_checkpoint = "checkpoints/faceshq.ckpt"

    # total laziness, I didn't want to refactor this after switching to invoking over cli.
    arg_mapping = {
        "prompts": "prompts",
        "max_iterations": "iterations",
        "display_freq": "save_every",
        "size": "size",
        "init_image": "init_image",
        "output": "output",
        "make_video": "video",
        "make_zoom_video": "zoom_video",
        "zoom_frequency": "zoom_save_every",
        "zoom_scale": "zoom_scale",
        "zoom_shift_x": "zoom_shift_x",
        "zoom_shift_y": "zoom_shift_y",
        "cuda_device": "cuda_device"
    }

    # run vqgan
    # build up command line args by reversing the mapping above
    args_list = []
    for k, v in vars(args).items():
        if v is not None:
            args_list.append("--{}".format(arg_mapping[k]))
            if v is not True and v is not False:
                args_list.append(str(v))
    return args_list

def process_image():
    cleanup()
    try:
        image = client.process_image(zoom_supported)
        if not image:
            print("No image found")
            return
        # args = SimpleNamespace()
        # get image data
        image_data = client.get_image_data(image.id)

        def update_image(iterations: int, status: str):
            image_data = None
            # get output image
            image_path = os.path.join("images", image.id + ".jpg")
            if os.path.exists(image_path):
                with open(image_path, "rb") as f:
                    image_data = f.read()
                # base64 encode image
                image_data = base64.encodebytes(image_data).decode("utf-8")
            # update image
            client.update_image(image.id, image_data, iterations, status)
        
        def update_video_data():
            print("Updating video data")
            # get video data
            with open(os.path.join("images", image.id + ".mp4"), "rb") as f:
                video_data = f.read()
            client.update_video_data(image.id, video_data)
        
        if image.model == "vqgan_imagenet_f16_16384":
            args_list = _vqgan_args(image_data, image)

        update_image(0, "processing")
        result = subprocess.run(["python", "vqgan_clip/generate.py"] + args_list)
        if result.returncode != 0:
            raise Exception("Error running vqgan")
        if image.enable_video:
            update_video_data()
        update_image(image.iterations, "completed")
        return True
    except Exception as e:
        print(f"Error: {e}")
        traceback.print_exc()
        try:
            update_image(image.iterations, "error")
        except:
            pass # we did our best to report status
        return

if __name__ == "__main__":
    backoff = 2
    while True:
        if process_image():
            backoff = 1
            time.sleep(0.1)
        else:
            if backoff < 60:
                backoff *= 2
            time.sleep(backoff)
