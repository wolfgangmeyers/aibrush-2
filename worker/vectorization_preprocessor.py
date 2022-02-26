from PIL import Image
import glob
import os
from vqgan_clip.generate import run, default_args
import requests
import time
import subprocess

# Step 1: Prepare 512x512 images
print("Cropping and resizing input images")
if not os.path.exists("pexel_resized"):
    os.makedirs("pexel_resized")
for imagename in os.listdir("pexel"):
    if imagename.endswith(".jpg"):
        if os.path.exists(os.path.join("pexel_resized", imagename)):
            print(f"{imagename} already exists")
            continue
        img = Image.open(os.path.join("pexel", imagename))
        # Get width and height of current image
        # then crop to center square
        width, height = img.size
        crop_size = min(width, height)
        left = (width - crop_size) / 2
        top = (height - crop_size) / 2
        right = (width + crop_size) / 2
        bottom = (height + crop_size) / 2
        img = img.crop((left, top, right, bottom))
        # resize to 512x512
        img = img.resize((512, 512), Image.ANTIALIAS)
        img.save(os.path.join("pexel_resized", imagename))


# Step 2: Morph images with vqgan_clip
print("\n\nMorphing images")
if not os.path.exists("pexel_morphed"):
    os.makedirs("pexel_morphed")
for imagename in os.listdir("pexel_resized"):
    if os.path.exists(os.path.join("pexel_morphed", imagename)):
        print(f"{imagename} already exists")
        continue
    print(f"Morphing {imagename}")
    args = default_args()
    args.prompts = "vector art"
    args.max_iterations = 25
    args.display_freq = 25
    args.init_image = os.path.join("pexel_resized", imagename)
    args.output = os.path.join("pexel_morphed", imagename)
    run(args)


# Step 3: Convert images into svg using vectorizer.io
print("\n\nConverting images into svg")
# prompt user for key
api_key = input("Enter your vectorizer.io api key: ")
if not os.path.exists("vectorizer_svg"):
    os.makedirs("vectorizer_svg")

# Here is a curl request that shows how to use vectorizer.io:
"""
$ curl --http1.1 -H "Expect:" --header "X-CREDITS-CODE: {api_key}" "https://api.vectorizer.io/v4.0/vectorize" -F "image=@exampleimage.png" -F "format=svg" -F "colors=0" -F "model=auto" -F "algorithm=auto" -F "details=auto" -F "antialiasing=auto" -F "minarea=5" -F "colormergefactor=5" -F "unit=auto" -F "width=0" -F "height=0" -F "roundness=default" -F "palette=" -vvv -o exampleimage.svg
"""
# implement the same thing using requests library
def vectorizer(imagename):
    svg_name = imagename.split(".")[0] + ".svg"
    if os.path.exists(os.path.join("vectorizer_svg", svg_name)):
        print(f"{svg_name} already exists")
        return
    url = "https://api.vectorizer.io/v4.0/vectorize"
    headers = {
        "X-CREDITS-CODE": api_key,
    }
    
    files = {
        "image": open(os.path.join("pexel_morphed", imagename), "rb"),
        "format": "svg",
        "colors": 0,
        "model": "auto",
        "algorithm": "auto",
        "details": "auto",
        "antialiasing": "auto",
        "minarea": 5,
        "colormergefactor": 5,
        "unit": "auto",
        "width": 0,
        "height": 0,
        "roundness": "default",
        "palette": "",
    }
    resp = requests.request("POST", url, headers=headers, files=files, timeout=30)
    # print(resp.text)
    with open(os.path.join("vectorizer_svg", svg_name), "w") as f:
        f.write(resp.text)
    return resp.text

for imagename in os.listdir("pexel_morphed"):
    print(f"Vectorizing {imagename}")
    # vectorizer(imagename)
    # try up to 5 times to run vectorizer
    for i in range(5):
        try:
            vectorizer(imagename)
            break
        except:
            print(f"Failed to vectorize {imagename}")
            time.sleep(1)
            continue

print("Converting svg back to png")
if not os.path.exists("vectorizer_png"):
    os.makedirs("vectorizer_png")
for svg_name in os.listdir("vectorizer_svg"):
    if svg_name.endswith(".svg"):
        png_name = svg_name.split(".")[0] + ".png"
        if os.path.exists(os.path.join("vectorizer_png", png_name)):
            print(f"{png_name} already exists")
            continue
        print(f"Rendering {svg_name}")
        # resvg [OPTIONS] <in-svg> <out-png>  # from file to file
        subprocess.run(["resvg", os.path.join("vectorizer_svg", svg_name), os.path.join("vectorizer_png", png_name)])

# Step 4: Combine pexel_morphed images with vectorizer_png
# Load the same image from both folders, resize to 256x256, and combine side-by-side
print("\n\nCombining images")
if not os.path.exists("combined"):
    os.makedirs("combined")
for imagename in os.listdir("pexel_morphed"):
    if imagename.endswith(".jpg"):
        if os.path.exists(os.path.join("combined", imagename)):
            print(f"{imagename} already exists")
            continue
        print(f"Combining {imagename}")
        png_name = imagename.split(".")[0] + ".png"
        img1 = Image.open(os.path.join("pexel_morphed", imagename))
        img2 = Image.open(os.path.join("vectorizer_png", png_name))
        img1 = img1.resize((256, 256), Image.ANTIALIAS)
        img2 = img2.resize((256, 256), Image.ANTIALIAS)
        img = Image.new("RGB", (512, 256))
        img.paste(img1, (0, 0))
        img.paste(img2, (256, 0))
        # save as png
        img.save(os.path.join("combined", png_name))
