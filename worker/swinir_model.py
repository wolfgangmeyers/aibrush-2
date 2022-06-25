# adapted from https://github.com/JingyunLiang/SwinIR

import argparse
from types import SimpleNamespace
import cv2
import glob
import numpy as np
from collections import OrderedDict
import os
import torch
import requests

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

class SwinIRModel:

    def __init__(self):
        self.device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
        # set up model
        if os.path.exists(model_args.model_path):
            print(f'loading model from {model_args.model_path}')
        else:
            os.makedirs(os.path.dirname(model_args.model_path), exist_ok=True)
            url = 'https://github.com/JingyunLiang/SwinIR/releases/download/v0.0/{}'.format(os.path.basename(model_args.model_path))
            r = requests.get(url, allow_redirects=True)
            print(f'downloading model {model_args.model_path}')
            open(model_args.model_path, 'wb').write(r.content)

        self.model = define_model(model_args)
        self.model.eval()
        self.model = self.model.to(self.device)

    def generate(self, args):
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
