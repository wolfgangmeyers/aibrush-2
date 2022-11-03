from queue import Queue
import threading
import sys
import time
import uuid
import signal
from types import SimpleNamespace
from sd_text2im_model import StableDiffusionText2ImageModel


def handler(signum, frame):
    sys.exit(1)


signal.signal(signal.SIGINT, handler)

if len(sys.argv) < 2:
    print("Usage: python3 stress_test.py <num_threads>")
    sys.exit(1)

print("warming up (main thread)...")

model = StableDiffusionText2ImageModel()


image_args = SimpleNamespace(
    prompt="A cat",
    H=512,
    W=512,
    seed=1,
    filename=f"{uuid.uuid4()}.png",
    ddim_steps=50,
    strength=0.75,
    init_img=None,
)
model.generate(image_args)

input_queue = Queue(1)
output_queue = Queue(1)


def worker():
    print("warming up (worker thread)...")
    model.generate(image_args)
    output_queue.put(0)
    print("worker thread ready")
    total_count = 0
    while True:
        args = input_queue.get()
        if args is None:
            output_queue.put(total_count)
            break
        model.generate(args)
        total_count += 1


# num_threads is the first argument
num_threads = int(sys.argv[1])
threads = []
for i in range(num_threads):
    t = threading.Thread(target=worker)
    t.start()
    threads.append(t)

# wait until warm up of each thread is done
for i in range(num_threads):
    output_queue.get()
print("all threads ready")

start = time.time()
# run for 60 seconds
while time.time() - start < 60:
    input_queue.put(image_args)
for i in range(num_threads):
    input_queue.put(None)

total_count = 0
for i in range(num_threads):
    total_count += output_queue.get()

print(f"Generated {total_count} images in 60 seconds")
