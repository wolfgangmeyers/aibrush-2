from typing import Tuple
import torch

def get_free_memory() -> Tuple[int, int]:
    free, total = torch.cuda.mem_get_info()
    print(f"Free memory: {free}")
    print(f"Total memory: {total}")

    return free
