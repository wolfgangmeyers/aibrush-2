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
from PIL import Image
import torch
import argparse
from io import BytesIO

import clip_rank
from dalle_model import DalleModel
from glid_3_xl_model import Glid3XLModel
from swinir_model import SwinIRModel
# from vqgan_clip.generate import run, default_args
from vqgan_model import VQGANModel



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

def cleanup():
    # delete all files in the current folder ending in .png or .backup
    for fname in os.listdir("images"):
        if fname.endswith(".jpg") or fname.endswith(".mp4") or fname.endswith(".npy"):
            os.remove(os.path.join("images", fname))
    for fname in os.listdir("output"):
        if fname.endswith(".png"):
            os.remove(os.path.join("output", fname))
    for fname in os.listdir("output_npy"):
        os.remove(os.path.join("output_npy", fname))
    if os.path.exists("steps"):
        for fname in os.listdir("steps"):
            os.remove(os.path.join("steps", fname))
    if os.path.exists("results"):
        for fname in os.listdir(os.path.join("results", "swinir_real_sr_x4")):
            os.remove(os.path.join("results", "swinir_real_sr_x4", fname))

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
    args.size = [image.width, image.height]
    return args

# def _to_args_list(args: SimpleNamespace, arg_mapping=None):
#     args_list = []
#     for k, v in vars(args).items():
#         if v is not None:
#             key = k
#             if arg_mapping is not None and k in arg_mapping:
#                 key = arg_mapping[k]
#             if v != False:
#                 args_list.append("--{}".format(key))
#                 # if v is a list, join with space
#                 if isinstance(v, list):
#                     args_list.extend([str(item) for item in v])
#                 elif v is not True and v is not False:
#                     args_list.append(str(v))
#     return args_list

def _swinir_args(image_data, image):
    # python SwinIR\main_test_swinir.py --task real_sr --model_path 003_realSR_BSRGAN_DFO_s64w8_SwinIR-M_x4_GAN.pth --folder_lq images --scale 4
    if not image_data:
        raise Exception("Image data is required for SwinIR")
    args = SimpleNamespace()
    args.model_path = "003_realSR_BSRGAN_DFO_s64w8_SwinIR-M_x4_GAN.pth"
    # downsampling to 256 width yields better results
    buf = BytesIO(image_data)
    img = Image.open(buf)
    basewidth = 256
    if img.width <= img.height:
        wpercent = (basewidth/float(img.size[0]))
        hsize = int((float(img.size[1])*float(wpercent)))
        img = img.resize((basewidth,hsize), Image.ANTIALIAS)
    else:
        hpercent = (basewidth/float(img.size[1]))
        wsize = int((float(img.size[0])*float(hpercent)))
        img = img.resize((wsize,basewidth), Image.ANTIALIAS)
    init_image_path = os.path.join("images", image.id + "-init.jpg")
    output_image_path = os.path.join("images", image.id + ".jpg")
    img.save(init_image_path)
    args.init_image = init_image_path
    args.output_image = output_image_path
    return args

def _dalle_mega_args(image):
    return SimpleNamespace(
        prompt="|".join(image.phrases),
        output_image=os.path.join("images", image.id + ".jpg"),
    )

def _glid_3_xl_args(image_data, mask_data, npy_data, image):
    args = SimpleNamespace()
    # TODO: attempt to edit using npy if available, otherwise use the init image.
    if image_data:
        # save image
        with open(os.path.join("images", image.id + "-init.jpg"), "wb") as f:
            f.write(image_data)
        if not mask_data:
            args.init_image = os.path.join("images", image.id + "-init.jpg")
    if mask_data:
        # save mask
        with open(os.path.join("images", image.id + "-mask.jpg"), "wb") as f:
            f.write(mask_data)
        args.mask = os.path.join("images", image.id + "-mask.jpg")

        if npy_data:
            # save npy
            with open(os.path.join("images", image.id + "-npy.npy"), "wb") as f:
                f.write(npy_data)
            args.edit = os.path.join("images", image.id + "-npy.npy")
        else:
            args.edit = os.path.join("images", image.id + "-init.jpg")

    if mask_data:
        args.model_path = "inpaint.pt"
    else:
        args.model_path = "finetune.pt"
    if len(image.phrases) > 0:
        args.text = "|".join(image.phrases)
    if len(image.negative_phrases) > 0:
        args.negative = "|".join(image.negative_phrases)
    if (image.uncrop_offset_x):
        args.edit_x = image.uncrop_offset_x
    if (image.uncrop_offset_y):
        args.edit_y = image.uncrop_offset_y
    args.skip_timesteps = image.glid_3_xl_skip_iterations
    args.clip_guidance = image.glid_3_xl_clip_guidance
    args.clip_guidance_scale = image.glid_3_xl_clip_guidance_scale
    args.width = image.width
    args.height = image.height
    args.steps = image.iterations
    return args

model_name: str = None
model = None
clip_ranker = None

def get_clip_ranker():
    global clip_ranker
    if clip_ranker is None:
        clip_ranker = clip_rank.ClipRanker(SimpleNamespace(cpu=False))
    return clip_ranker


def create_model():
    global model
    if model_name == "dalle_mega":
        model = DalleModel("mega_full")
    elif model_name == "glid_3_xl":
        model = Glid3XLModel()
    elif model_name == "swinir":
        model = SwinIRModel()
    elif model_name == "vqgan_imagenet_f16_16384":
        model = VQGANModel()

def process_image():
    global clip_ranker
    global model_name, model
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
            score = 0
            image_data = None
            npy_data = None
            # get output image
            image_path = os.path.join("images", image.id + ".jpg")
            if image.model == "glid_3_xl" and os.path.exists(os.path.join("output", "00000.png")):
                Image.open(os.path.join("output", "00000.png")).save(image_path)
            if image.model == "swinir" and os.path.exists(image_path):
                img = Image.open(image_path)
                # resize image
                img = img.resize((image.width, image.height), Image.ANTIALIAS)
                img.save(image_path)
                
            if os.path.exists(image_path):
                prompts = "|".join(image.phrases)
                print(f"Calculating clip ranking for '{prompts}'")
                score = get_clip_ranker().rank(argparse.Namespace(text=prompts, image=image_path, cpu=False))
                with open(image_path, "rb") as f:
                    image_data = f.read()
                # base64 encode image
                image_data = base64.encodebytes(image_data).decode("utf-8")
            if image.model == "glid_3_xl":
                npy_path = os.path.join("output_npy", "00000.npy")
                if os.path.exists(npy_path):
                    with open(npy_path, "rb") as f:
                        npy_data = f.read()
                        npy_data = base64.encodebytes(npy_data).decode("utf-8")
            # update image
            client.update_image(image.id, image_data, npy_data, iterations, status, score)
        
        def update_video_data():
            print("Updating video data")
            # get video data
            with open(os.path.join("images", image.id + ".mp4"), "rb") as f:
                video_data = f.read()
            client.update_video_data(image.id, video_data)

        if image.model != model_name:
            model_name = image.model
            create_model()
        
        if image.model == "dalle_mega":
            args = _dalle_mega_args(image)
        elif image.model == "vqgan_imagenet_f16_16384":
            args = _vqgan_args(image_data, image)
        elif image.model == "glid_3_xl":
            mask_data = client.get_mask_data(image.id)
            npy_data = client.get_npy_data(image.id)
            args = _glid_3_xl_args(image_data, mask_data, npy_data, image)
        elif image.model == "swinir":
            args = _swinir_args(image_data, image)

        update_image(0, "processing")

        model.generate(args)
        # processor_cmd = ["python", cmd] + args_list
        # print(f"Running {' '.join(processor_cmd)}")
        # result = subprocess.run(processor_cmd)
        # if result.returncode != 0:
        #     raise Exception("Error running generator")
        #  only update video if vqgan
        if image.model == "vqgan_imagenet_f16_16384" and image.enable_video:
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
            if backoff < 10:
                backoff *= 2
            time.sleep(backoff)
