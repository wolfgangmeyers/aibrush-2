from sd_text2im_model import StableDiffusionText2ImageModel
from types import SimpleNamespace
import random

model = StableDiffusionText2ImageModel()
for i in range(0, 20):
    model.generate(SimpleNamespace(
        prompt="A portrait of a beautiful disney princess, highly detailed digital art, sharp focus, pixar, deviantart, artstation, unreal engine, raytracing",
        negative_prompt="ugly, badly drawn, rough, distorted, deformed",
        # image="disney.jpg",
        image=None,
        warmup=False,
        filename=f"disney.result.{i}.jpg",
        seed=random.randint(0, 1000000),
    ))
