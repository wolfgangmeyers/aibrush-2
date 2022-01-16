from transformers import pipeline
from typing import List
import random
import sys
import json
import traceback
from api_client import AIBrushAPI

SEED_ITEMS_LENGTH = 15

api_url = "http://www.aibrush.art"
if len(sys.argv) > 1:
    api_url = sys.argv[1]
# load credentials.json
with open('credentials.json') as f:
    access_token = json.load(f)["accessToken"]

client = AIBrushAPI(api_url, access_token)


generator = pipeline('text-generation', model='EleutherAI/gpt-neo-2.7B', device=0)

def process_suggestions_job():
    try:
        suggestions_job = client.process_suggestion_job()
        if not suggestions_job:
            print("No suggestions job found")
            return
        seed = client.get_suggestion_seed(suggestions_job.id)
        if not seed:
            print(f"No seed found for job {suggestions_job.id}, setting to done")
            client.update_suggestions_job(suggestions_job.id, "completed", [])
            return
        # get a copy of seed.items list and shuffle it
        seed_items: List[str] = seed.items.copy()
        random.shuffle(seed_items)
        if len(seed_items) > SEED_ITEMS_LENGTH:
            seed_items = seed_items[:SEED_ITEMS_LENGTH]
        prompt = "\n>>>" + "\n>>>".join(seed_items)
        result = generator(
            prompt,
            do_sample=True,
            min_length=suggestions_job.min_length,
            max_length=suggestions_job.max_length,
        )
        # TODO: figure out the shape of the result, extract, parse and truncate
        # the suggestions list.
        # TODO: filter out duplicate suggestions,
        # filter out items that are also in the seed

        # discard the last item in case the AI gets confused
        # and stops making a list of suggestions.
        # put reasonable min/max length filter on the results based on
        # min/max length from the seed. >= 50% of the smallest seed item,
        # <= 200% of the largest seed item.
    except Exception as err:
        print(f"Error processing suggestions job: {err}")
        traceback.print_exc()
        return

# result = generator(seed, do_sample=True, min_length=2048, max_length=2048)

