from sd_inpaint_model import StableDiffusionInpaintingModel
from types import SimpleNamespace
import random

model = StableDiffusionInpaintingModel()
for i in range(0, 20):
    model.generate(SimpleNamespace(
        prompt="A portrait of a beautiful disney princess, highly detailed digital art, sharp focus, pixar, deviantart, artstation, unreal engine, raytracing, nude, erect nipples, perfect breasts",
        image="disney.jpg",
        mask="disney.mask.jpg",
        filename=f"disney.result.{i}.jpg",
        seed=random.randint(0, 1000000),
    ))
