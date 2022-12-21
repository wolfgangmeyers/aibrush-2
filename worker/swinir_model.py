# adapted from https://github.com/JingyunLiang/SwinIR

import argparse
from types import SimpleNamespace
import cv2
import glob
import numpy as np
import math
from collections import OrderedDict
import os
import torch
import requests
import PIL

from model_process import child_process

from swinir.models.network_swinir import SwinIR as net
from swinir.utils import util_calculate_psnr_ssim as util

folder = "images"
border = 0
window_size = 8

model_args = SimpleNamespace(**{
    'task': 'classical_sr',
    'scale': 4,
    'noise': 15,
    'jpeg': 40,
    'training_patch_size': 128,
    'large_model': False,
    'model_path': '003_realSR_BSRGAN_DFO_s64w8_SwinIR-M_x4_GAN.pth',
    'tile': None,
    'tile_overlap': 32,
})

def load_model():
    model = define_model(model_args)
    model.eval()
    return model

class SwinIRModel:
    def __init__(self):
        self.device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
        # set up model
        if os.path.exists(model_args.model_path):
            print(f'loading model from {model_args.model_path}')
        else:
            model_folder = os.path.dirname(model_args.model_path)
            if model_folder != "":
                os.makedirs(os.path.dirname(model_args.model_path), exist_ok=True)
            url = 'https://github.com/JingyunLiang/SwinIR/releases/download/v0.0/{}'.format(os.path.basename(model_args.model_path))
            r = requests.get(url, allow_redirects=True)
            print(f'downloading model {model_args.model_path}')
            open(model_args.model_path, 'wb').write(r.content)
        self.model = load_model()
        self.model = self.model.to(self.device)

    def _generate_image(self, args):
        init_image = args.init_image
        output_image = args.output_image
        # read image
        img_lq = read_image(init_image)  # image to HWC-BGR, float32
        img_lq = np.transpose(img_lq if img_lq.shape[2] == 1 else img_lq[:, :, [2, 1, 0]], (2, 0, 1))  # HCW-BGR to CHW-RGB
        img_lq = torch.from_numpy(img_lq).float().unsqueeze(0).to(self.device)  # CHW-RGB to NCHW-RGB

        # inference
        with torch.no_grad():
            # pad input image to be a multiple of window_size
            _, _, h_old, w_old = img_lq.size()
            h_pad = (h_old // window_size + 1) * window_size - h_old
            w_pad = (w_old // window_size + 1) * window_size - w_old
            img_lq = torch.cat([img_lq, torch.flip(img_lq, [2])], 2)[:, :, :h_old + h_pad, :]
            img_lq = torch.cat([img_lq, torch.flip(img_lq, [3])], 3)[:, :, :, :w_old + w_pad]
            output = test(img_lq, self.model)
            output = output[..., :h_old * model_args.scale, :w_old * model_args.scale]

        # save image
        output = output.data.squeeze().float().cpu().clamp_(0, 1).numpy()
        if output.ndim == 3:
            output = np.transpose(output[[2, 1, 0], :, :], (1, 2, 0))  # CHW-RGB to HCW-BGR
        output = (output * 255.0).round().astype(np.uint8)  # float32 to uint8
        cv2.imwrite(output_image, output)
        return False

    def _split_image(self, init_image: str):
        img = PIL.Image.open(init_image)
        # Check if the image area is larger than 640x640
        if img.width * img.height > 512 * 512:
            tile_size = min(img.width, img.height, 512)
            # split the image into 640x640 tiles
            # they need to overlap by at least 32 pixels
            # so that the edges can be merged
            
            # calculate the number of tiles in each dimension
            num_tiles_x = math.ceil(img.width / (tile_size - 32))
            num_tiles_y = math.ceil(img.height / (tile_size - 32))
            
            for x in range(num_tiles_x):
                for y in range(num_tiles_y):
                    # calculate the bounding box of the tile
                    x0 = x * (tile_size - 32)
                    y0 = y * (tile_size - 32)
                    x1 = min(x0 + tile_size, img.width)
                    y1 = min(y0 + tile_size, img.height)
                    # crop the tile
                    tile = img.crop((x0, y0, x1, y1))
                    # save the tile
                    tile.save(os.path.join(folder, f"{x}_{y}.png"))
            # return num_tiles_x, num_tiles_y, tile_size
            return SimpleNamespace(
                num_tiles_x=num_tiles_x,
                num_tiles_y=num_tiles_y,
                tile_size=tile_size,
                image_width=img.width,
                image_height=img.height,
            )
        else:
            return None

    def _merge_tiles(self, split_result: SimpleNamespace, output_image: str):
        # create a new image
        img = PIL.Image.new("RGB", (split_result.image_width, split_result.image_height))
        for x in range(split_result.num_tiles_x):
            for y in range(split_result.num_tiles_y):
                # load the tile
                tile = PIL.Image.open(os.path.join(folder, f"{x}_{y}.png"))
                # paste the tile into the new image
                img.paste(tile, (x * (split_result.tile_size - 32), y * (split_result.tile_size - 32)))
        # save the new image
        img.save(output_image)

    def generate(self, args):
        init_image = args.init_image
        output_image = args.output_image
        split_result = self._split_image(init_image)
        if not split_result:
            return self._generate_image(args)
        else:
            for x in range(split_result.num_tiles_x):
                for y in range(split_result.num_tiles_y):
                    args.init_image = os.path.join(folder, f"{x}_{y}.png")
                    args.output_image = os.path.join(folder, f"{x}_{y}_out.png")
                    self._generate_image(args)
            self._merge_tiles(split_result, output_image)
            return False

def define_model(model_args):
    # 003 real-world image sr
    if not model_args.large_model:
        # use 'nearest+conv' to avoid block artifacts
        model = net(upscale=model_args.scale, in_chans=3, img_size=64, window_size=8,
                    img_range=1., depths=[6, 6, 6, 6, 6, 6], embed_dim=180, num_heads=[6, 6, 6, 6, 6, 6],
                    mlp_ratio=2, upsampler='nearest+conv', resi_connection='1conv')
    else:
        # larger model size; use '3conv' to save parameters and memory; use ema for GAN training
        model = net(upscale=model_args.scale, in_chans=3, img_size=64, window_size=8,
                    img_range=1., depths=[6, 6, 6, 6, 6, 6, 6, 6, 6], embed_dim=240,
                    num_heads=[8, 8, 8, 8, 8, 8, 8, 8, 8],
                    mlp_ratio=2, upsampler='nearest+conv', resi_connection='3conv')
    param_key_g = 'params_ema'

    pretrained_model = torch.load(model_args.model_path)
    model.load_state_dict(pretrained_model[param_key_g] if param_key_g in pretrained_model.keys() else pretrained_model, strict=True)

    return model

def read_image(path):
    # 003 real-world image sr (load lq image only)
    return cv2.imread(path, cv2.IMREAD_COLOR).astype(np.float32) / 255.

def test(img_lq, model):
    # test the image as a whole
    output = model(img_lq)

    return output

if __name__ == "__main__":
    child_process(SwinIRModel, "swinir")
