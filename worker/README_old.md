## Images Worker Colab Notebook

The following notebook can be used as a worker node for AIBrush:
https://colab.research.google.com/drive/1cW3vVjdeI19o7a9miMu47J5EDyHfZT20#scrollTo=Ed1iT6_JK0Mo

## Images worker setup

These instructions are for how to get a worker node running on a local machine or VM with an Nvidia GPU.
At least 12GB of VRAM is needed to run the images worker, but 16GB is recommended (needed for zoom functionality)

Create a new virtual Python environment for VQGAN-CLIP:

```sh
conda create --name vqgan python=3.9
conda activate vqgan
```

### Install Pytorch in the new enviroment:

Note: This installs the CUDA version of Pytorch, if you want to use an AMD graphics card, read the [AMD section below](#using-an-amd-graphics-card).

```sh
pip install torch==1.9.0+cu111 torchvision==0.10.0+cu111 torchaudio==0.9.0 -f https://download.pytorch.org/whl/torch_stable.html cython
```

### Install Glid-3 XL dependencies

```sh
pip install dalle_pytorch albumentations opencv-python imageio imageio-ffmpeg pytorch-lightning omegaconf test-tube streamlit einops torch-fidelity transformers 

pip install -e git+https://github.com/CompVis/taming-transformers.git@master#egg=taming-transformers
pip install -e git+https://github.com/openai/CLIP.git@main#egg=clip
```

### SwinIR dependencies

Download [the pretrained model](https://github.com/JingyunLiang/SwinIR/releases/download/v0.0/003_realSR_BSRGAN_DFO_s64w8_SwinIR-M_x4_GAN.pth) and place it in the `worker/` folder.

```sh
pip install timm
```

## Dalle Mega dependencies

```sh
pip install git+https://github.com/huggingface/transformers.git git+https://github.com/patil-suraj/vqgan-jax.git git+https://github.com/borisdayma/dalle-mini.git tqdm flax==0.5.0
```

### Install other required Python packages:

```sh
pip install ftfy regex tqdm omegaconf pytorch-lightning IPython kornia imageio imageio-ffmpeg einops torch_optimizer requests
```

### Clone additional dependencies

```bash
git clone 'https://github.com/wolfgangmeyers/VQGAN-CLIP' vqgan_clip
git clone 'https://github.com/openai/CLIP'
git clone 'https://github.com/CompVis/taming-transformers'
git clone 'https://github.com/CompVis/latent-diffusion.git'
git clone 'https://github.com/JingyunLiang/SwinIR'

pip install -e ./latent-diffusion
```

### Download pre-trained models

```bash
mkdir checkpoints

curl -L -o checkpoints/vqgan_imagenet_f16_16384.yaml -C - 'https://heibox.uni-heidelberg.de/d/a7530b09fed84f80a887/files/?p=%2Fconfigs%2Fmodel.yaml&dl=1' #ImageNet 16384
curl -L -o checkpoints/vqgan_imagenet_f16_16384.ckpt -C - 'https://heibox.uni-heidelberg.de/d/a7530b09fed84f80a887/files/?p=%2Fckpts%2Flast.ckpt&dl=1' #ImageNet 16384
```

## Running images worker

Run `python images_worker.py http://<backend ip address or hostname>` or `python images_worker.py https://<backend ip address or hostname>` if using https. Example: if running on the same machine as the backend, you can run the following to connect and start processing images:

```shell
python images_worker.py http://localhost:3000
```

## Suggestions worker setup

Create a new virtual Python environment for the suggestions worker:

```sh
conda create --name suggestions python=3.9
conda activate suggestions
```

Install transformers library:

```sh
pip install transformers
```
