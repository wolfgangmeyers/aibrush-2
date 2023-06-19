import sys
import torch
import os
from safetensors.torch import load_file, save_file

sd_file = os.path.expanduser(sys.argv[1])
# vae_file = sys.argv[2]
# out_file = sys.argv[3]
vae_file = os.path.expanduser(sys.argv[2])
out_file = os.path.expanduser(sys.argv[3])

if sd_file.endswith(".safetensors"):
    sd_model = load_file(sd_file, device="cpu")
else:
    sd_model = torch.load(sd_file, map_location="cpu")["state_dict"]
if vae_file.endswith(".safetensors"):
    vae_model = load_file(vae_file, device="cpu")["state_dict"]
else:
    vae_model = torch.load(vae_file, map_location="cpu")["state_dict"]

for vae_key in vae_model:
    sd_key = f"first_stage_model.{vae_key}"
    sd_model[sd_key] = vae_model[vae_key]

if out_file.endswith(".safetensors"):
    save_file(sd_model, out_file)
else:
    torch.save({"state_dict": sd_model}, out_file)
