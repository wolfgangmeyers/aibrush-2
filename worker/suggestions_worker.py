from typing import List
import random
import sys
import json
import traceback
import time
from transformers import GPT2TokenizerFast
import requests

# Refactor to use NLPCloud API
with open("nlpcloud.json") as infile:
    nlpcloud_config = json.load(infile)

def generate_suggestions(text: str, max_length: int):
    try:
        resp = requests.post(
            "https://api.nlpcloud.io/v1/gpu/gpt-j/generation",
            headers={
                "Authorization": f"Token {nlpcloud_config['token']}",
                "Content-Type": "application/json",
            },
            data=json.dumps({"text": text, "max_length": max_length, "min_length": max_length}),
        )
        return resp.json()["generated_text"]
    except Exception as e:
        print(f"Error generating suggestions: {e}")
        traceback.print_exc()

tokenizer = GPT2TokenizerFast.from_pretrained("gpt2")

from api_client import AIBrushAPI

SEED_ITEMS_LENGTH = 30

api_url = "http://www.aibrush.art"
if len(sys.argv) > 1:
    api_url = sys.argv[1]
# load credentials.json
with open('credentials.json') as f:
    access_token = json.load(f)["accessToken"]

client = AIBrushAPI(api_url, access_token)

def process_suggestions_job():
    try:
        suggestions_job = client.process_suggestion_job()
        if not suggestions_job:
            print("No suggestions job found")
            return
        seed = client.get_suggestion_seed(suggestions_job.seed_id)
        if not seed:
            print(f"No seed found for job {suggestions_job.id}, setting to done")
            client.update_suggestions_job(suggestions_job.id, "completed", [])
            return
        # get a copy of seed.items list and shuffle it
        seed_items: List[str] = seed.items.copy()
        random.shuffle(seed_items)
        if len(seed_items) > SEED_ITEMS_LENGTH:
            seed_items = seed_items[:SEED_ITEMS_LENGTH]
        prompt = "\n---\n".join(seed_items)
        print(f"Generating suggestions for seed {seed.id}")
        print(f"Prompt: {prompt}")
        prompt_token_count = len(tokenizer(prompt)['input_ids'])
        generated_text = generate_suggestions(prompt, prompt_token_count * 4)
        # skip the seed and discard the last suggestion, it might be garbage
        suggestions = generated_text.split("\n---\n")[len(seed_items):-1]
        
        print(f"Suggestions: {len(suggestions)}")
        dedup = {}

        def filter_suggestion(suggestion) -> bool:
            if suggestion in dedup:
                return False
            dedup[suggestion] = True
            return (
                len(suggestion) > 4
                and len(suggestion) < 100
                and suggestion not in seed_items
            )
        
        suggestions = list(filter(filter_suggestion, suggestions))
        client.update_suggestions_job(suggestions_job.id, "completed", suggestions)
    except Exception as err:
        print(f"Error processing suggestions job: {err}")
        traceback.print_exc()
        return

if __name__ == "__main__":
    while True:
        process_suggestions_job()
        time.sleep(1)