from transformers import pipeline
generator = pipeline('text-generation', model='EleutherAI/gpt-neo-2.7B', device=0)

# result = generator(seed, do_sample=True, min_length=2048, max_length=2048, gpu=0)

