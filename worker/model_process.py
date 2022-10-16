import subprocess
from types import SimpleNamespace
import argparse
import json
from printutil import eprint
import traceback

# wrap the local model in a separate process
class ModelProcess:

    def __init__(self, model_file: str) -> None:
        print("ModelProcess created")
        self.process = subprocess.Popen(["python", model_file], stdin=subprocess.PIPE, stdout=subprocess.PIPE)

    def generate(self, args: SimpleNamespace | argparse.Namespace) -> bool:
        print("ModelProcess generate called")
        nsfw = False
        self.process.stdin.write(json.dumps(args.__dict__).encode())
        self.process.stdin.write(b"\n")
        self.process.stdin.flush()
        print("ModelProcess sent args to child process generate")
        line = self.process.stdout.readline().decode().strip()
        print(line)
        while line not in ("GENERATED", "EXCEPTION"):
            line = self.process.stdout.readline().decode().strip()
            print(line)
            if line.find("NSFW") != -1:
                nsfw = True
        if line == "EXCEPTION":
            raise Exception("Exception in model process")
        return nsfw

    def __del__(self):
        if self.process:
            self.process.kill()
            self.process.wait()
            self.process = None
            print("Model process killed")

def child_process(Model, name):
    eprint(f"local model process running for {name}")
    model = None
    eprint("model process created")
    while True:
        try:
            args_json = input()
            args = SimpleNamespace(**json.loads(args_json))
            if model is None:
                model = Model(args)
            eprint(f"input received: {args}")
            model.generate(args)
            print("GENERATED")
        except Exception as e:
            eprint(e)
            traceback.print_exc()
            print("EXCEPTION")
            continue
