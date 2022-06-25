# copied and adapted from https://github.com/Jack000/glid-3-xl
import gc
import io
import math
import sys
from types import SimpleNamespace

from PIL import Image, ImageOps
import requests
import torch
from torch import nn
from torch.nn import functional as F
from torchvision import transforms
from torchvision.transforms import functional as TF
from tqdm.notebook import tqdm

import numpy as np

from guided_diffusion.script_util import create_model_and_diffusion, model_and_diffusion_defaults

from dalle_pytorch import DiscreteVAE, VQGanVAE

from einops import rearrange
from math import log2, sqrt

import argparse
import pickle

import os

from encoders.modules import BERTEmbedder

import clip
from fileutil import download_file

default_args = dict(
    model_path='finetune.pt',
    kl_path='kl-f8.pt',
    bert_path='bert.pt',
    text='',
    edit='',
    edit_x=0,
    edit_y=0,
    edit_width=0,
    edit_height=0,
    mask='',
    negative='',
    init_image=None,
    skip_timesteps=0,
    prefix='',
    num_batches=1,
    batch_size=1,
    width=256,
    height=256,
    seed=-1,
    guidance_scale=5.0,
    steps=0,
    cpu=False,
    clip_score=False,
    clip_guidance=False,
    clip_guidance_scale=150,
    cutn=16,
    ddim=False,
    ddpm=False,
)

def fetch(url_or_path):
    if str(url_or_path).startswith('http://') or str(url_or_path).startswith('https://'):
        r = requests.get(url_or_path)
        r.raise_for_status()
        fd = io.BytesIO()
        fd.write(r.content)
        fd.seek(0)
        return fd
    return open(url_or_path, 'rb')


class MakeCutouts(nn.Module):
    def __init__(self, cut_size, cutn, cut_pow=1.):
        super().__init__()

        self.cut_size = cut_size
        self.cutn = cutn
        self.cut_pow = cut_pow

    def forward(self, input):
        sideY, sideX = input.shape[2:4]
        max_size = min(sideX, sideY)
        min_size = min(sideX, sideY, self.cut_size)
        cutouts = []
        for _ in range(self.cutn):
            size = int(torch.rand([])**self.cut_pow * (max_size - min_size) + min_size)
            offsetx = torch.randint(0, sideX - size + 1, ())
            offsety = torch.randint(0, sideY - size + 1, ())
            cutout = input[:, :, offsety:offsety + size, offsetx:offsetx + size]
            cutouts.append(F.adaptive_avg_pool2d(cutout, self.cut_size))
        return torch.cat(cutouts)


def spherical_dist_loss(x, y):
    x = F.normalize(x, dim=-1)
    y = F.normalize(y, dim=-1)
    return (x - y).norm(dim=-1).div(2).arcsin().pow(2).mul(2)


def tv_loss(input):
    """L2 total variation loss, as in Mahendran et al."""
    input = F.pad(input, (0, 1, 0, 1), 'replicate')
    x_diff = input[..., :-1, 1:] - input[..., :-1, :-1]
    y_diff = input[..., 1:, :-1] - input[..., :-1, :-1]
    return (x_diff**2 + y_diff**2).mean([1, 2, 3])

if not torch.cuda.is_available():
    raise Exception('No GPU found')

device = torch.device('cuda:0')
print('Using device:', device)

def set_requires_grad(model, value):
    for param in model.parameters():
        param.requires_grad = value

class Glid3XLModel:
    def __init__(self):
        self._ensure_model_files()
        self.steps = 50
        self.clip_guidance = False
        self.model_path = "finetune.pt"
        self._init_model()
    
    def _ensure_model_files(self):
        # # text encoder (required)
        if not os.path.exists('bert.pt'):
            download_file('https://dall-3.com/models/glid-3-xl/bert.pt', 'bert.pt')

        # # ldm first stage (required)
        if not os.path.exists('kl-f8.pt'):
            download_file('https://dall-3.com/models/glid-3-xl/kl-f8.pt', 'kl-f8.pt')

        # # new model fine tuned on a cleaner dataset (will not generate watermarks, split images or blurry images)
        if not os.path.exists('finetune.pt'):
            download_file('https://dall-3.com/models/glid-3-xl/finetune.pt', 'finetune.pt')

        # # inpaint
        if not os.path.exists('inpaint.pt'):
            download_file('https://dall-3.com/models/glid-3-xl/inpaint.pt', 'inpaint.pt')

    
    def _init_model(self):
        gc.collect()
        self.model_state_dict = torch.load(self.model_path, map_location='cpu')
        self.model_params = {
            'attention_resolutions': '32,16,8',
            'class_cond': False,
            'diffusion_steps': 1000,
            'rescale_timesteps': True,
            'timestep_respacing': str(self.steps),  # Modify this value to decrease the number of
                                        # timesteps.
            'image_size': 32,
            'learn_sigma': False,
            'noise_schedule': 'linear',
            'num_channels': 320,
            'num_heads': 8,
            'num_res_blocks': 2,
            'resblock_updown': False,
            'use_fp16': False,
            'use_scale_shift_norm': False,
            'clip_embed_dim': 768 if 'clip_proj.weight' in self.model_state_dict else None,
            'image_condition': True if self.model_state_dict['input_blocks.0.0.weight'].shape[1] == 8 else False,
            'super_res_condition': True if 'external_block.0.0.weight' in self.model_state_dict else False,
        }
        self.model_config = model_and_diffusion_defaults()
        self.model_config.update(self.model_params)
        self.model, self.diffusion = create_model_and_diffusion(**self.model_config)
        self.model.load_state_dict(self.model_state_dict)
        self.model.requires_grad_(self.clip_guidance).eval().to(device)
        if self.model_config["use_fp16"]:
            self.model.convert_to_fp16()
        else:
            self.model.convert_to_fp32()
        self.ldm = torch.load("kl-f8.pt", map_location="cpu")
        self.ldm.to(device)
        self.ldm.eval()
        self.ldm.requires_grad_(self.clip_guidance)
        set_requires_grad(self.ldm, self.clip_guidance)

        self.bert = BERTEmbedder(1280, 32)
        self.bert_state_dict = torch.load("bert.pt", map_location="cpu")
        self.bert.load_state_dict(self.bert_state_dict)
        self.bert.to(device)
        self.bert.half().eval()
        set_requires_grad(self.bert, False)

        self.clip_model, self.clip_preprocess = clip.load('ViT-L/14', device=device, jit=False)
        self.clip_model.eval().requires_grad_(False)
        self.normalize = transforms.Normalize(mean=[0.48145466, 0.4578275, 0.40821073], std=[0.26862954, 0.26130258, 0.27577711])

    def generate(self, args: SimpleNamespace | argparse.Namespace):
        args = SimpleNamespace(**{
            **default_args,
            **args.__dict__
        })
        if args.clip_guidance != self.clip_guidance or args.steps != self.steps or args.model_path != self.model_path:
            print("Reloading model")
            self.clip_guidance = args.clip_guidance
            self.steps = args.steps
            self.model_path = args.model_path
            self._init_model()
        if args.seed >= 0:
            torch.manual_seed(args.seed)

        # bert context
        text_emb = self.bert.encode([args.text]*args.batch_size).to(device).float()
        text_blank = self.bert.encode([args.negative]*args.batch_size).to(device).float()

        text = clip.tokenize([args.text]*args.batch_size, truncate=True).to(device)
        text_clip_blank = clip.tokenize([args.negative]*args.batch_size, truncate=True).to(device)


        # clip context
        text_emb_clip = self.clip_model.encode_text(text)
        text_emb_clip_blank = self.clip_model.encode_text(text_clip_blank)

        make_cutouts = MakeCutouts(self.clip_model.visual.input_resolution, args.cutn)

        text_emb_norm = text_emb_clip[0] / text_emb_clip[0].norm(dim=-1, keepdim=True)

        image_embed = None

        # image context
        if args.edit:
            if args.edit.endswith('.npy'):
                with open(args.edit, 'rb') as f:
                    im = np.load(f)
                    im = torch.from_numpy(im).unsqueeze(0).to(device)

                    input_image = torch.zeros(1, 4, args.height//8, args.width//8, device=device)

                    y = args.edit_y//8
                    x = args.edit_x//8

                    ycrop = y + im.shape[2] - input_image.shape[2]
                    xcrop = x + im.shape[3] - input_image.shape[3]

                    ycrop = ycrop if ycrop > 0 else 0
                    xcrop = xcrop if xcrop > 0 else 0

                    input_image[0,:,y if y >=0 else 0:y+im.shape[2],x if x >=0 else 0:x+im.shape[3]] = im[:,:,0 if y > 0 else -y:im.shape[2]-ycrop,0 if x > 0 else -x:im.shape[3]-xcrop]

                    input_image_pil = self.ldm.decode(input_image)
                    input_image_pil = TF.to_pil_image(input_image_pil.squeeze(0).add(1).div(2).clamp(0, 1))

                    input_image *= 0.18215
            else:
                w = args.edit_width if args.edit_width else args.width
                h = args.edit_height if args.edit_height else args.height

                input_image_pil = Image.open(fetch(args.edit)).convert('RGB')
                input_image_pil = ImageOps.fit(input_image_pil, (w, h))

                input_image = torch.zeros(1, 4, args.height//8, args.width//8, device=device)

                im = transforms.ToTensor()(input_image_pil).unsqueeze(0).to(device)
                im = 2*im-1
                im = self.ldm.encode(im).sample()

                y = args.edit_y//8
                x = args.edit_x//8

                input_image = torch.zeros(1, 4, args.height//8, args.width//8, device=device)

                ycrop = y + im.shape[2] - input_image.shape[2]
                xcrop = x + im.shape[3] - input_image.shape[3]

                ycrop = ycrop if ycrop > 0 else 0
                xcrop = xcrop if xcrop > 0 else 0

                input_image[0,:,y if y >=0 else 0:y+im.shape[2],x if x >=0 else 0:x+im.shape[3]] = im[:,:,0 if y > 0 else -y:im.shape[2]-ycrop,0 if x > 0 else -x:im.shape[3]-xcrop]

                input_image_pil = self.ldm.decode(input_image)
                input_image_pil = TF.to_pil_image(input_image_pil.squeeze(0).add(1).div(2).clamp(0, 1))

                input_image *= 0.18215
            if not args.mask:
                raise Exception("mask is required for edit")
            mask_image = Image.open(fetch(args.mask)).convert('L')
            mask_image = mask_image.resize((args.width//8,args.height//8), Image.ANTIALIAS)
            mask = transforms.ToTensor()(mask_image).unsqueeze(0).to(device)
            

            mask1 = (mask > 0.5)
            mask1 = mask1.float()

            input_image *= mask1

            image_embed = torch.cat(args.batch_size*2*[input_image], dim=0).float()
        elif self.model_params['image_condition']:
            # using inpaint model but no image is provided
            image_embed = torch.zeros(args.batch_size*2, 4, args.height//8, args.width//8, device=device)

        kwargs = {
            "context": torch.cat([text_emb, text_blank], dim=0).float(),
            "clip_embed": torch.cat([text_emb_clip, text_emb_clip_blank], dim=0).float() if self.model_params['clip_embed_dim'] else None,
            "image_embed": image_embed
        }

        # Create a classifier-free guidance sampling function
        def model_fn(x_t, ts, **kwargs):
            half = x_t[: len(x_t) // 2]
            combined = torch.cat([half, half], dim=0)
            model_out = self.model(combined, ts, **kwargs)
            eps, rest = model_out[:, :3], model_out[:, 3:]
            cond_eps, uncond_eps = torch.split(eps, len(eps) // 2, dim=0)
            half_eps = uncond_eps + args.guidance_scale * (cond_eps - uncond_eps)
            eps = torch.cat([half_eps, half_eps], dim=0)
            return torch.cat([eps, rest], dim=1)

        cur_t = None

        def cond_fn(x, t, context=None, clip_embed=None, image_embed=None):
            with torch.enable_grad():
                x = x[:args.batch_size].detach().requires_grad_()

                n = x.shape[0]

                my_t = torch.ones([n], device=device, dtype=torch.long) * cur_t

                kw = {
                    'context': context[:args.batch_size],
                    'clip_embed': clip_embed[:args.batch_size] if self.model_params['clip_embed_dim'] else None,
                    'image_embed': image_embed[:args.batch_size] if image_embed is not None else None
                }

                out = self.diffusion.p_mean_variance(self.model, x, my_t, clip_denoised=False, model_kwargs=kw)

                fac = self.diffusion.sqrt_one_minus_alphas_cumprod[cur_t]
                x_in = out['pred_xstart'] * fac + x * (1 - fac)

                x_in /= 0.18215

                x_img = self.ldm.decode(x_in)

                clip_in = self.normalize(make_cutouts(x_img.add(1).div(2)))
                clip_embeds = self.clip_model.encode_image(clip_in).float()
                dists = spherical_dist_loss(clip_embeds.unsqueeze(1), text_emb_clip.unsqueeze(0))
                dists = dists.view([args.cutn, n, -1])

                losses = dists.sum(2).mean(0)

                loss = losses.sum() * args.clip_guidance_scale

                return -torch.autograd.grad(loss, x)[0]
    
        if args.ddpm:
            sample_fn = self.diffusion.ddpm_sample_loop_progressive
        elif args.ddim:
            sample_fn = self.diffusion.ddim_sample_loop_progressive
        else:
            sample_fn = self.diffusion.plms_sample_loop_progressive

        def save_sample(i, sample, clip_score=False):
            for k, image in enumerate(sample['pred_xstart'][:args.batch_size]):
                image /= 0.18215
                im = image.unsqueeze(0)
                out = self.ldm.decode(im)

                npy_filename = f'output_npy/{args.prefix}{i * args.batch_size + k:05}.npy'
                with open(npy_filename, 'wb') as outfile:
                    np.save(outfile, image.detach().cpu().numpy())

                out = TF.to_pil_image(out.squeeze(0).add(1).div(2).clamp(0, 1))

                filename = f'output/{args.prefix}{i * args.batch_size + k:05}.png'
                out.save(filename)

                if clip_score:
                    image_emb = self.clip_model.encode_image(self.clip_preprocess(out).unsqueeze(0).to(device))
                    image_emb_norm = image_emb / image_emb.norm(dim=-1, keepdim=True)

                    similarity = torch.nn.functional.cosine_similarity(image_emb_norm, text_emb_norm, dim=-1)

                    final_filename = f'output/{args.prefix}_{similarity.item():0.3f}_{i * args.batch_size + k:05}.png'
                    os.rename(filename, final_filename)

                    npy_final = f'output_npy/{args.prefix}_{similarity.item():0.3f}_{i * args.batch_size + k:05}.npy'
                    os.rename(npy_filename, npy_final)

        if args.init_image:
            init = Image.open(args.init_image).convert('RGB')
            init = init.resize((int(args.width),  int(args.height)), Image.LANCZOS)
            init = TF.to_tensor(init).to(device).unsqueeze(0).clamp(0,1)
            h = self.ldm.encode(init * 2 - 1).sample() *  0.18215
            init = torch.cat(args.batch_size*2*[h], dim=0)
        else:
            init = None

        for i in range(args.num_batches):
            cur_t = self.diffusion.num_timesteps - 1

            samples = sample_fn(
                model_fn,
                (args.batch_size*2, 4, int(args.height/8), int(args.width/8)),
                clip_denoised=False,
                model_kwargs=kwargs,
                cond_fn=cond_fn if args.clip_guidance else None,
                device=device,
                progress=True,
                init_image=init,
                skip_timesteps=args.skip_timesteps,
            )

            for j, sample in enumerate(samples):
                cur_t -= 1
                if j % 5 == 0 and j != self.diffusion.num_timesteps - 1:
                    save_sample(i, sample)

            save_sample(i, sample, args.clip_score)
