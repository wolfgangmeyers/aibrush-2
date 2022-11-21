FROM nvidia/cuda:11.0.3-base-ubuntu20.04

# # Run the application:
# COPY myapp.py .
# CMD ["python", "myapp.py"]

# first apt-get update
RUN apt-get update
RUN DEBIAN_FRONTEND=noninteractive apt-get install -y tzdata
RUN apt-get install -y software-properties-common
RUN add-apt-repository -y ppa:deadsnakes/ppa
RUN apt-get update
RUN apt-get install -y python3.10 python3.10-dev python3.10-venv git wget libgl1-mesa-glx

ENV VIRTUAL_ENV=/opt/venv
RUN python3.10 -m venv $VIRTUAL_ENV
ENV PATH="$VIRTUAL_ENV/bin:$PATH"

RUN pip install torch torchvision torchaudio --extra-index-url https://download.pytorch.org/whl/cu113
RUN pip install transformers==4.19.2 diffusers invisible-watermark
RUN pip install cython
RUN pip install omegaconf einops pytorch-lightning transformers pip install ftfy regex omegaconf pytorch-lightning IPython kornia imageio imageio-ffmpeg einops torch_optimizer requests cog timm numpy opencv-python-headless pillow

RUN pip install -e git+https://github.com/CompVis/stable-diffusion#egg=latent-diffusion
RUN pip install -e git+https://github.com/openai/CLIP.git@main#egg=clip
RUN pip install -e git+https://github.com/CompVis/taming-transformers.git@master#egg=taming-transformers

# include license in the image
RUN wget https://huggingface.co/spaces/runwayml/stable-diffusion-license/raw/main/license.txt -O /STABLE_DIFFUSION_LICENSE.txt

# mkdir and set working directory to /app
RUN mkdir /app
WORKDIR /app

RUN git clone https://github.com/wolfgangmeyers/aibrush-2.git
WORKDIR /app/aibrush-2/worker
RUN git clone https://github.com/wolfgangmeyers/SwinIR.git swinir
RUN mkdir -p models/ldm/stable-diffusion-v1/

CMD ["/app/aibrush-2/worker/images_worker.sh"]
