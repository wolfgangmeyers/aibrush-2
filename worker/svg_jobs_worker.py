import sys
import os
import traceback
import subprocess
import time

import json
from api_client import AIBrushAPI

api_url = "https://www.aibrush.art"
if len(sys.argv) > 1:
    api_url = sys.argv[1]

# load credentials.json
with open('credentials.json') as f:
    access_token = json.load(f)["accessToken"]

client = AIBrushAPI(api_url, access_token)

# create 'svg_jobs' folder if it doesn't exist
if not os.path.exists("svg_jobs"):
    os.makedirs("svg_jobs")
os.chdir("svg_jobs")

def cleanup():
    # delete all files in the current folder ending in .jpg or .svg
    for fname in os.listdir("."):
        if fname.endswith(".jpg") or fname.endswith(".svg"):
            os.remove(fname)

def process_svg_job():
    cleanup()
    try:
        svg_job = client.process_svg_job()
        if not svg_job:
            print("No svg job found")
            return
        # TODO: parameterization of vectorizer?
        image_data = client.get_image_data(svg_job.image_id)

        def update_svg_job():
            print("Updating svg job")
            with open(svg_job.id + ".svg") as f:
                svg_data = f.read()
            client.update_svg_job(svg_job.id, svg_data)
        
        # write image data to file
        with open(svg_job.id + ".jpg", "wb") as f:
            f.write(image_data)
        # Run vtracer:
        # vtracer -i {svg_job.id}.jpg -o {svg_job.id}.svg -p 8 --preset photo
        subprocess.run(["vtracer", "-i", svg_job.id + ".jpg", "-o", svg_job.id + ".svg", "-p", "8", "--preset", "photo"])
        update_svg_job()

    except Exception as e:
        print(f"Error: {e}")
        traceback.print_exc()
        return

if __name__ == "__main__":
    while True:
        process_svg_job()
        time.sleep(5)