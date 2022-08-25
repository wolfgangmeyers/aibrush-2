# adapted from https://github.com/CompVis/stable-diffusion txt2im.py - 69ae4b35e0a0f6ee1af8bb9a5d0016ccb27e36dc
import argparse, os, sys, glob
from types import SimpleNamespace
import cv2
import torch
import numpy as np
from omegaconf import OmegaConf
import PIL
from PIL import Image
from tqdm import tqdm, trange
from imwatermark import WatermarkEncoder
from itertools import islice
from einops import rearrange, repeat
from torchvision.utils import make_grid
from torch import autocast
from contextlib import nullcontext
import time
from pytorch_lightning import seed_everything
from torch import autocast
from contextlib import contextmanager, nullcontext

from ldm.util import instantiate_from_config
from ldm.models.diffusion.ddim import DDIMSampler
from ldm.models.diffusion.plms import PLMSSampler

from diffusers.pipelines.stable_diffusion.safety_checker import StableDiffusionSafetyChecker
from transformers import AutoFeatureExtractor
from model_process import child_process

_default_args = SimpleNamespace(
    prompt="a painting of a virus monster playing guitar",
    outdir="images",
    skip_grid=False,
    ddim_steps=50,
    plms=False,
    fixed_code=False,
    ddim_eta=0.0,
    H=512,
    W=512,
    C=4,
    f=8,
    scale=7.5,
    config="configs/stable-diffusion/v1-inference.yaml",
    ckpt="models/ldm/stable-diffusion-v1/model.ckpt",
    seed=42,
    precision="autocast",
    init_img=None,
    strength=0.75,
)

# load safety model
safety_model_id = "CompVis/stable-diffusion-safety-checker"
safety_feature_extractor = AutoFeatureExtractor.from_pretrained(safety_model_id)
safety_checker = StableDiffusionSafetyChecker.from_pretrained(safety_model_id)


def chunk(it, size):
    it = iter(it)
    return iter(lambda: tuple(islice(it, size)), ())


def numpy_to_pil(images):
    """
    Convert a numpy image or a batch of images to a PIL image.
    """
    if images.ndim == 3:
        images = images[None, ...]
    images = (images * 255).round().astype("uint8")
    pil_images = [Image.fromarray(image) for image in images]

    return pil_images


def load_model_from_config(config, ckpt, verbose=False):
    print(f"Loading model from {ckpt}")
    pl_sd = torch.load(ckpt, map_location="cpu")
    if "global_step" in pl_sd:
        print(f"Global Step: {pl_sd['global_step']}")
    sd = pl_sd["state_dict"]
    model = instantiate_from_config(config.model)
    m, u = model.load_state_dict(sd, strict=False)
    if len(m) > 0 and verbose:
        print("missing keys:")
        print(m)
    if len(u) > 0 and verbose:
        print("unexpected keys:")
        print(u)

    model.cuda()
    model.eval()
    return model


def load_img(path, w, h):
    image = Image.open(path).convert("RGB")
    # w, h = image.size
    # print(f"loaded input image of size ({w}, {h}) from {path}")
    # w, h = map(lambda x: x - x % 32, (w, h))  # resize to integer multiple of 32
    image = image.resize((w, h), resample=PIL.Image.LANCZOS)
    image = np.array(image).astype(np.float32) / 255.0
    image = image[None].transpose(0, 3, 1, 2)
    image = torch.from_numpy(image)
    return 2.*image - 1.

def put_watermark(img, wm_encoder=None):
    if wm_encoder is not None:
        img = cv2.cvtColor(np.array(img), cv2.COLOR_RGB2BGR)
        img = wm_encoder.encode(img, 'dwtDct')
        img = Image.fromarray(img[:, :, ::-1])
    return img


def load_replacement(x):
    try:
        hwc = x.shape
        y = Image.open("assets/rick.jpeg").convert("RGB").resize((hwc[1], hwc[0]))
        y = (np.array(y)/255.0).astype(x.dtype)
        assert y.shape == x.shape
        return y
    except Exception:
        return x


def check_safety(x_image):
    # safety_checker_input = safety_feature_extractor(numpy_to_pil(x_image), return_tensors="pt")
    # x_checked_image, has_nsfw_concept = safety_checker(images=x_image, clip_input=safety_checker_input.pixel_values)
    # assert x_checked_image.shape[0] == len(has_nsfw_concept)
    # for i in range(len(has_nsfw_concept)):
    #     if has_nsfw_concept[i]:
    #         x_checked_image[i] = load_replacement(x_checked_image[i])
    # return x_checked_image, has_nsfw_concept
    return x_image, False


class StableDiffusionText2ImageModel:
    def __init__(self, args=None):
        args = _default_args
        self.config = OmegaConf.load(f"{args.config}")
        self.model = load_model_from_config(self.config, f"{args.ckpt}")
        self.device = torch.device("cuda") if torch.cuda.is_available() else torch.device("cpu")
        self.model = self.model.to(self.device)
        if args.plms:
            raise NotImplementedError("PLMS sampler not (yet) supported")
            # self.sampler = PLMSSampler(self.model)
        else:
            self.sampler = DDIMSampler(self.model)
        os.makedirs(args.outdir, exist_ok=True)
        self.outpath = args.outdir
        print("Creating invisible watermark encoder (see https://github.com/ShieldMnt/invisible-watermark)...")
        self.wm = "StableDiffusionV1"
        self.wm_encoder = WatermarkEncoder()
        self.wm_encoder.set_watermark('bytes', self.wm.encode('utf-8'))

    def generate(self, args: SimpleNamespace | argparse.Namespace):
        default_args = _default_args.__dict__
        if args.init_img:
            default_args = {
                **default_args,
                "scale": 5.0,
            }
        args = SimpleNamespace(**{
            **default_args,
            **args.__dict__,
        })
        seed_everything(args.seed)

        prompt = args.prompt
        assert prompt is not None
        data = [[prompt]]

        sample_path = self.outpath
        os.makedirs(sample_path, exist_ok=True)
        base_count = len(os.listdir(sample_path))

        start_code = None
        if args.fixed_code:
            start_code = torch.randn([1, args.C, args.H // args.f, args.W // args.f], device=self.device)
        if args.init_img:
            assert os.path.isfile(args.init_img)
            init_image = load_img(args.init_img, args.W, args.H).to(self.device)
            #TODO: is this needed?
            init_image = repeat(init_image, '1 ... -> b ...', b=1)
            init_latent = self.model.get_first_stage_encoding(self.model.encode_first_stage(init_image))  # move to latent space
            self.sampler.make_schedule(ddim_num_steps=args.ddim_steps, ddim_eta=args.ddim_eta, verbose=False)

            assert 0. <= args.strength <= 1., 'can only work with strength in [0.0, 1.0]'
            t_enc = int(args.strength * args.ddim_steps)
            print(f"target t_enc is {t_enc} steps")

        precision_scope = autocast if args.precision=="autocast" else nullcontext
        with torch.no_grad():
            with precision_scope("cuda"):
                with self.model.ema_scope():
                    # for n in trange(args.n_iter, desc="Sampling"):
                    for prompts in tqdm(data, desc="data"):
                        uc = None
                        if args.scale != 1.0:
                            uc = self.model.get_learned_conditioning(1 * [""])
                        if isinstance(prompts, tuple):
                            prompts = list(prompts)
                        c = self.model.get_learned_conditioning(prompts)
                        if args.init_img:
                            # encode (scaled latent)
                            z_enc = self.sampler.stochastic_encode(init_latent, torch.tensor([t_enc]*1).to(self.device))
                            # decode it
                            samples = self.sampler.decode(z_enc, c, t_enc, unconditional_guidance_scale=args.scale,
                                                    unconditional_conditioning=uc,)

                            x_samples = self.model.decode_first_stage(samples)
                            x_samples = torch.clamp((x_samples + 1.0) / 2.0, min=0.0, max=1.0)

                            for x_sample in x_samples:
                                x_sample = 255. * rearrange(x_sample.cpu().numpy(), 'c h w -> h w c')
                                outfilename = os.path.join(sample_path, args.filename)
                                Image.fromarray(x_sample.astype(np.uint8)).save(outfilename)
                                print(f"Saved to {outfilename}")
                                base_count += 1
                        else:
                            shape = [args.C, args.H // args.f, args.W // args.f]
                            samples_ddim, _ = self.sampler.sample(S=args.ddim_steps,
                                                            conditioning=c,
                                                            batch_size=1,
                                                            shape=shape,
                                                            verbose=False,
                                                            unconditional_guidance_scale=args.scale,
                                                            unconditional_conditioning=uc,
                                                            eta=args.ddim_eta,
                                                            x_T=start_code)

                            x_samples_ddim = self.model.decode_first_stage(samples_ddim)
                            x_samples_ddim = torch.clamp((x_samples_ddim + 1.0) / 2.0, min=0.0, max=1.0)
                            x_samples_ddim = x_samples_ddim.cpu().permute(0, 2, 3, 1).numpy()

                            # TODO: handle nsfw?
                            x_checked_image, has_nsfw_concept = check_safety(x_samples_ddim)

                            x_checked_image_torch = torch.from_numpy(x_checked_image).permute(0, 3, 1, 2)

                            for x_sample in x_checked_image_torch:
                                x_sample = 255. * rearrange(x_sample.cpu().numpy(), 'c h w -> h w c')
                                img = Image.fromarray(x_sample.astype(np.uint8))
                                img = put_watermark(img, self.wm_encoder)
                                
                                img.save(os.path.join(sample_path, args.filename))
                                print(f"Saved to {os.path.join(sample_path, args.filename)}")
                                base_count += 1

                    # toc = time.time()

        print(f"Your samples are ready and waiting for you here: \n{self.outpath} \n"
            f" \nEnjoy.")


if __name__ == "__main__":
    child_process(StableDiffusionText2ImageModel, "stable_diffusion_text2im")