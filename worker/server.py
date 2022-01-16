# This standalone server is adapted from the worker code,
# but is meant to work in a standalone fashion without the
# need for a central server. Results are written to s3.

# testing with curl
# curl -H "Content-Type: application/json" -d '{"id": "asdf", "text_prompt": "A cute cartoon frog", "iterations": 100}' http://localhost:5000/image

import requests
import sys
import os
from types import SimpleNamespace
import time
import json
from api_client import AIBrushAPI
import base64
import traceback
import flask
import boto3
import threading

BUCKET = "aibrush-test"

from vqgan_clip.generate import run, default_args

def cleanup():
    # delete all files in the current folder ending in .png or .backup
    for fname in os.listdir("."):
        if fname.endswith(".png"):
            os.remove(fname)

# flask api
app = flask.Flask(__name__)

# create image endpoint
@app.route('/image', methods=['POST'])
def create_image():
    # get payload
    payload = flask.request.get_json()
    t = threading.Thread(target=handle_create, args=(payload,))
    t.start()
    return "OK"

def handle_create(payload):
    args = SimpleNamespace(**default_args().__dict__)
    # get image id
    image_id = payload["id"]
    # get image data
    image_data = None
    if "image_data" in payload:
        image_data = payload["image_data"]
        # decode image data
        image_data = base64.decodebytes(image_data.encode("utf-8"))
        with open(f"{image_id}-init.png", "wb") as f:
            f.write(image_data)
        args.init_image = f"{image_id}-init.png"
    # get text prompt
    args.prompts = payload["text_prompt"]

    # get iterations
    iterations = payload["iterations"]
    args.max_iterations = iterations
    args.output = f"{image_id}.png"
    run(args)
    # get output image
    with open(f"{image_id}.png", "rb") as f:
        image_data = f.read()
    # write image data to s3
    s3 = boto3.resource('s3')
    s3.Bucket(BUCKET).put_object(Key=f"{image_id}.png", Body=image_data)
    cleanup()

# start flask server
if __name__ == '__main__':
    app.run(host="0.0.0.0", port=5000)
