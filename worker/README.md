## Worker setup

These instructions are for how to get a worker node running on a local machine running Ubuntu 22.04. Tested with RTX 3090.

### Install venv

```sh
sudo apt install python3.10-venv
```

### Install python header files

```sh
sudo apt-get install python3-dev
```

### Create env

```sh
python3 -m venv venv
source venv/bin/activate
```

### Install dependencies:

```sh
pip install torch torchvision torchaudio --extra-index-url https://download.pytorch.org/whl/cu113

pip install transformers==4.19.2 diffusers invisible-watermark
pip install -e git+https://github.com/CompVis/stable-diffusion#egg=latent-diffusion

pip install cython websockets accelerate
pip install dalle_pytorch albumentations opencv-python imageio imageio-ffmpeg pytorch-lightning omegaconf test-tube streamlit einops torch-fidelity transformers

pip install ftfy regex omegaconf pytorch-lightning IPython kornia imageio imageio-ffmpeg einops torch_optimizer requests cog timm numpy opencv-python-headless pillow

pip install -e git+https://github.com/CompVis/taming-transformers.git@master#egg=taming-transformers
pip install -e git+https://github.com/openai/CLIP.git@main#egg=clip

# pip install git+https://github.com/wolfgangmeyers/SwinIR
git clone  

```

In order to use stable diffusion, you need to download the weights. Navigate
[here](https://huggingface.co/CompVis/stable-diffusion-v-1-4-original) and agree to terms so you can download the weights (`sd-v1-4.ckpt`).

In the `worker` folder, move the config to `configs/stable-diffusion/` and
move the weights to `models/ldm/stable-diffusion-v1` and rename to `model.ckpt`

## Running images worker

Run `python images_worker.py http://<backend ip address or hostname>` or `python images_worker.py https://<backend ip address or hostname>` if using https. Example: if running on the same machine as the backend, you can run the following to connect and start processing images:

```shell
python images_worker.py http://localhost:3000
```
