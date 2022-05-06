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
for folder in ["images", "output", "output_npy"]:
    if not os.path.exists(folder):
        os.makedirs(folder)

def cleanup():
    # delete all files in the current folder ending in .png or .backup
    for fname in os.listdir("images"):
        if fname.endswith(".jpg") or fname.endswith(".mp4"):
            os.remove(os.path.join("images", fname))
    for fname in os.listdir("output"):
        if fname.endswith(".png"):
            os.remove(os.path.join("output", fname))
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
    args.size = image.size

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
    return _to_args_list(args, arg_mapping)

def _to_args_list(args: SimpleNamespace, arg_mapping=None):
    args_list = []
    for k, v in vars(args).items():
        if v is not None:
            key = k
            if arg_mapping is not None and k in arg_mapping:
                key = arg_mapping[k]
            if v != False:
                args_list.append("--{}".format(key))
                if v is not True and v is not False:
                    args_list.append(str(v))
    return args_list

def _glid_3_xl_args(image_data, image):
    args = SimpleNamespace()
    if image_data:
        # save image
        with open(os.path.join("images", image.id + "-init.jpg"), "wb") as f:
            f.write(image_data)
        args.init_image = os.path.join("images", image.id + "-init.jpg")
    '''
    parser.add_argument('--model_path', type=str, default = 'finetune.pt',
                   help='path to the diffusion model')
parser.add_argument('--text', type = str, required = False, default = '',
                    help='your text prompt')
parser.add_argument('--edit', type = str, required = False,
                    help='path to the image you want to edit (either an image file or .npy containing a numpy array of the image embeddings)')
parser.add_argument('--mask', type = str, required = False,
                    help='path to a mask image. white pixels = keep, black pixels = discard. width = image width/8, height = image height/8')
parser.add_argument('--negative', type = str, required = False, default = '',
                    help='negative text prompt')
parser.add_argument('--init_image', type=str, required = False, default = None,
                   help='init image to use')
parser.add_argument('--skip_timesteps', type=int, required = False, default = 0,
                   help='how many diffusion steps are gonna be skipped')
parser.add_argument('--width', type = int, default = 256, required = False,
                    help='image size of output (multiple of 8)')
parser.add_argument('--height', type = int, default = 256, required = False,
                    help='image size of output (multiple of 8)')
parser.add_argument('--seed', type = int, default=-1, required = False,
                    help='random seed')
parser.add_argument('--guidance_scale', type = float, default = 5.0, required = False,
                    help='classifier-free guidance scale')
parser.add_argument('--steps', type = int, default = 0, required = False,
                    help='number of diffusion steps')
parser.add_argument('--clip_guidance', dest='clip_guidance', action='store_true')
parser.add_argument('--clip_guidance_scale', type = float, default = 150, required = False,
                    help='Controls how much the image should look like the prompt') # may need to use lower value for ddim
    '''
    args.model_path = "finetune.pt"
    args.text = " | ".join(image.phrases)
    args.skip_timesteps = image.glid_3_xl_skip_iterations
    args.clip_guidance = image.glid_3_xl_clip_guidance
    args.clip_guidance_scale = image.glid_3_xl_clip_guidance_scale
    args.width = image.size
    args.height = image.size
    args.steps = image.iterations
    return _to_args_list(args)

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
            if image.model == "glid_3_xl" and os.path.exists(os.path.join("output", "00000.png")):
                Image.open(os.path.join("output", "00000.png")).save(image_path)
                
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
            cmd = "vqgan_clip/generate.py"
        elif image.model == "glid_3_xl":
            args_list = _glid_3_xl_args(image_data, image)
            cmd = "glid-3-xl/sample.py"

        update_image(0, "processing")
        result = subprocess.run(["python", cmd] + args_list)
        if result.returncode != 0:
            raise Exception("Error running generator")
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