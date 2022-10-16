import random
import sys
import os
from types import SimpleNamespace
import time
import json

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

# default args for stable diffusion
# _default_args = SimpleNamespace(
#     prompt="a painting of a virus monster playing guitar",
#     outdir="outputs/txt2img-samples",
#     skip_grid=False,
#     skip_save=False,
#     ddim_steps=50,
#     plms=False,
#     fixed_code=False,
#     ddim_eta=0.0,
#     n_iter=2,
#     H=512,
#     W=512,
#     C=4,
#     f=8,
#     n_samples=3,
#     n_rows=0,
#     scale=7.5,
#     config="configs/stable-diffusion/v1-inference.yaml",
#     ckpt="models/ldm/stable-diffusion-v1/model.ckpt",
#     seed=42,
#     precision="autocast",
# )

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
    if model_name == "dalle_mega":
        model = ModelProcess("dalle_model.py")
    elif model_name == "glid_3_xl":
        model = ModelProcess("glid_3_xl_model.py")
    elif model_name == "swinir":
        model = ModelProcess("swinir_model.py")
    elif model_name == "vqgan_imagenet_f16_16384":
        model = ModelProcess("vqgan_model.py")
    elif model_name == "stable_diffusion_text2im":
        model = ModelProcess("sd_text2im_model.py")

def clear_model():
    global model
    model = None

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

        def update_image(iterations: int, status: str, nsfw: bool = False):
            score = 0
            negative_score = 0
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
                free_memory = get_free_memory()
                
                # during testing, clip ranking needs at most 4.4 GB of memory (2.4 is not enough)
                if free_memory/1e9 < 4.4 and not clip_ranker:
                    print("Clearing model to free up memory for clip ranking")
                    clear_model()
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
            if image.model == "glid_3_xl":
                npy_path = os.path.join("output_npy", "00000.npy")
                if os.path.exists(npy_path):
                    with open(npy_path, "rb") as f:
                        npy_data = f.read()
                        npy_data = base64.encodebytes(npy_data).decode("utf-8")
            # update image
            client.update_image(image.id, image_data, npy_data, iterations, status, score, negative_score, nsfw)
        
        def update_video_data():
            print("Updating video data")
            # get video data
            with open(os.path.join("images", image.id + ".mp4"), "rb") as f:
                video_data = f.read()
            client.update_video_data(image.id, video_data)

        if image.model == "dalle_mega":
            args = _dalle_mega_args(image)
        elif image.model == "vqgan_imagenet_f16_16384":
            args = _vqgan_args(image_data, image)
        elif image.model == "glid_3_xl":
            # if image.glid_3_xl_clip_guidance:
            #     clear_clip_ranker()
            mask_data = client.get_mask_data(image.id)
            npy_data = client.get_npy_data(image.id)
            args = _glid_3_xl_args(image_data, mask_data, npy_data, image)
        elif image.model == "swinir":
            args = _swinir_args(image_data, image)
        elif image.model == "stable_diffusion_text2im":
            args = _sd_args(image_data, None, None, image)

        if image.model != model_name:
            clear_model()
            model_name = image.model
            create_model()
        # else:
        #     # special case for glid_3_xl
        #     if image.model == "glid_3_xl":
        #         global model_signature
        #         # check model signature
        #         if model_signature != generate_model_signature(args):
        #             clear_model()
        #             create_model()
        #             model_signature = generate_model_signature(args)

        update_image(0, "processing")

        # detect memory overflow and clear clip ranker
        if image.model == "glid_3_xl":
            if image.width * image.height > 540672:
                print("Clearing clip ranker to free up memory for model generation")
                clear_clip_ranker()
        if not model:
            create_model()
        nsfw = model.generate(args)
        nsfw = nsfw or image.nsfw # inherit nsfw from parent

        #  only update video if vqgan
        if image.model == "vqgan_imagenet_f16_16384" and image.enable_video:
            update_video_data()
        update_image(image.iterations, "completed", nsfw)
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

    backoff = 2
    while True:
        if process_image():
            backoff = 1
            time.sleep(0.1)
        else:
            if backoff < 10:
                backoff *= 2
            time.sleep(backoff)
