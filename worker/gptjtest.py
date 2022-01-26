######################### Code if you installed pytorch #####################################
from transformers import GPTJForCausalLM, AutoTokenizer
import torch    

model = GPTJForCausalLM.from_pretrained("EleutherAI/gpt-j-6B", torch_dtype=torch.float16, low_cpu_mem_usage=True).to("cuda", dtype=torch.float16)
tokenizer = AutoTokenizer.from_pretrained("EleutherAI/gpt-j-6B")
context = """In a shocking finding, scientists discovered a herd of unicorns living in a remote, 
            previously unexplored valley, in the Andes Mountains. Even more surprising to the 
            researchers was the fact that the unicorns spoke perfect English."""

input_ids = tokenizer(context, return_tensors="pt").input_ids.to("cuda")
gen_tokens = model.generate(input_ids, do_sample=True, temperature=1.2, max_length=100, device=0)
gen_text = tokenizer.batch_decode(gen_tokens)[0]
print(gen_text)