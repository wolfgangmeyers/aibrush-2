import requests
import sys
from types import SimpleNamespace
import time

api_url = "https://aibrush.ngrok.io"
if len(sys.argv) > 1:
    api_url = sys.argv[1]
