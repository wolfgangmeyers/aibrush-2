import subprocess
from types import SimpleNamespace
import argparse
import traceback
import json

from clip_rank import ClipRanker
from printutil import eprint

def child_process():
    eprint("clip process running")
    clip_ranker = ClipRanker()
    eprint("clip process created")
    while True:
        try:
            args_json = input()
            args = SimpleNamespace(**json.loads(args_json))
            eprint(f"input received: {args}")
            rank = clip_ranker.rank(args)
            print(f"RESULT:{rank}")
        except Exception as e:
            eprint(e)
            traceback.print_exc()
            print("EXCEPTION")
            continue

if __name__ == "__main__":
    child_process()
