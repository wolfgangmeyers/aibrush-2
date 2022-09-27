from types import SimpleNamespace
from swinir_model import SwinIRModel

model = SwinIRModel()

args = SimpleNamespace(
    init_image = "test_image.png",
    output_image = "result.png",

)
model.generate(args)