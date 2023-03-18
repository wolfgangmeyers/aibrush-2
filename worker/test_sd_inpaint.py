from sd_inpaint_model import StableDiffusionInpaintingModel
from types import SimpleNamespace
import random
import os

model = StableDiffusionInpaintingModel()
model.generate(SimpleNamespace(
    prompt="A portrait of a beautiful disney princess, highly detailed digital art, sharp focus, pixar, deviantart, artstation, unreal engine, raytracing, nude, erect nipples, perfect breasts",
    image=os.path.join(os.path.dirname(__file__), "disney.jpg"),
    # mask="disney.mask.jpg",
    mask=os.path.join(os.path.dirname(__file__), "disney.mask.jpg"),
    # filename=f"disney.result.{i}.jpg",
    filename=os.path.join(os.path.dirname(__file__), f"disney.result.jpg"),
    seed=random.randint(0, 1000000),
    negative_prompt="ugly, distorted"
))
