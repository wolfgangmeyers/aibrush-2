import sys
import json
from api_client import AIBrushAPI

# prompt for backend host
if len(sys.argv) > 1:
    api_url = sys.argv[1]
else:
    api_url = input("Enter backend host: ")

# prompt for email
email = input("Enter email: ")

client = AIBrushAPI(api_url, "")
client.login(email)

# prompt for code
code = input("Enter code: ")
credentials = client.verify_login(email, code)

with open("credentials.json", "w") as f:
    json.dump({
        "accessToken": credentials.accessToken,
        "refreshToken": credentials.refreshToken,
    }, f)

print("Credentials saved to credentials.json")
