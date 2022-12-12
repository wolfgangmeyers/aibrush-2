import sys
import torch
import os

sd_file = os.path.expanduser(sys.argv[1])
# vae_file = sys.argv[2]
# out_file = sys.argv[3]
vae_file = os.path.expanduser(sys.argv[2])
out_file = os.path.expanduser(sys.argv[3])

sd_model = torch.load(sd_file, map_location="cpu")["state_dict"]
vae_model = torch.load(vae_file, map_location="cpu")["state_dict"]

for vae_key in vae_model:
    sd_key = f"first_stage_model.{vae_key}"
    sd_model[sd_key] = vae_model[vae_key]

torch.save({"state_dict": sd_model}, out_file)
