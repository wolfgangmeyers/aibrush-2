import requests
import sys
import os
from types import SimpleNamespace
import time
import json
from api_client import AIBrushAPI
import base64
import traceback

from vqgan_clip.generate import run, default_args

api_url = "https://aibrush.ngrok.io"
if len(sys.argv) > 1:
    api_url = sys.argv[1]

# load credentials.json
with open('credentials.json') as f:
    access_token = json.load(f)["accessToken"]

client = AIBrushAPI(api_url, access_token)

def cleanup():
    # delete all files in the current folder ending in .png or .backup
    for fname in os.listdir("."):
        if fname.endswith(".jpg"):
            os.remove(fname)

def process_image():
    cleanup()
    try:
        image = client.process_image()
        if not image:
            print("No image found")
            return
        args = SimpleNamespace(**default_args().__dict__)
        # get image data
        image_data = client.get_image_data(image.id)

        def update_image(iterations: int, status: str):
            # get output image
            with open(image.id + ".jpg", "rb") as f:
                image_data = f.read()
            # base64 encode image
            image_data = base64.encodebytes(image_data).decode("utf-8")
            # update image
            client.update_image(image.id, image_data, iterations, status)

        if image_data:
            # save image
            with open(image.id + "-init.jpg", "wb") as f:
                f.write(image_data)
            args.init_image = image.id + "-init.jpg"
        args.max_iterations = image.iterations
        args.prompts = " | ".join(image.phrases)
        args.output = image.id + ".jpg"
        args.display_freq = 20
        args.on_save_callback = lambda i: update_image(i, "processing")

        # run vqgan
        run(args)
        update_image(image.iterations, "completed")
    except Exception as e:
        print(f"Error: {e}")
        traceback.print_exc()
        return

if __name__ == "__main__":
    while True:
        process_image()
        time.sleep(5)
