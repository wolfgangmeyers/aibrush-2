FROM nvidia/cuda:11.3.0-devel-ubuntu20.04

# Dockerized environment for the following guide:
# https://note.com/kohya_ss/n/nbf7ce8d80f29

RUN apt-get update
RUN DEBIAN_FRONTEND=noninteractive apt-get install -y tzdata
RUN apt install git software-properties-common -y
RUN add-apt-repository ppa:deadsnakes/ppa -y
RUN apt-get update
RUN apt install python3.10 python3.10-venv python3.10-dev -y
RUN apt install ffmpeg libsm6 libxext6  -y

RUN python3.10 -m venv --system-site-packages venv_diffusers
ENV PATH="/venv_diffusers/bin:$PATH"
RUN pip install torch==1.12.1+cu116 torchvision==0.13.1+cu116 --extra-index-url https://download.pytorch.org/whl/cu116
RUN pip install accelerate==0.14.0 transformers>=4.21.0 ftfy albumentations opencv-python einops safetensors pytorch_lightning tqdm diffusers[torch]

RUN pip install ninja bitsandbytes tensorboard
RUN pip install -v -U git+https://github.com/facebookresearch/xformers.git@main#egg=xformers

# TODO: copy files over
