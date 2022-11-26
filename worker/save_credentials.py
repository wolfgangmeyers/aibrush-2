import sys
import os
import json

from api_client import AIBrushAPI

api_url = "https://www.aibrush.art"
if len(sys.argv) > 1:
    api_url = sys.argv[1]
worker_login_code = sys.argv[2]
client = AIBrushAPI(api_url, None, worker_login_code)
with open("credentials.json", "w") as outfile:
    json.dump({
        "accessToken": client.token,
    }, outfile)
