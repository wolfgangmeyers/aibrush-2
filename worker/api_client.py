import requests
import sys
from types import SimpleNamespace
import time
import json

class AIBrushAPI(object):
    def __init__(self, api_url: str, token: str):
        self.api_url = api_url
        self.token = token

    def http_request(self, path, method, body=None) -> requests.Response:
        url = f"{self.api_url}{path}"
        for i in range(2):
            try:
                return requests.request(method, url, json=body, headers={
                    "Content-Type": "application/json",
                })
            except Exception as err:
                print(f"Error making http request: {err}")
                time.sleep(5)

    def parse_json(json_str):
        try:
            return json.loads(json_str, object_hook=lambda d: SimpleNamespace(**d))
        except Exception as err:
            print(f"Error parsing json: {err}")
            return None

    def process_image(self) -> SimpleNamespace:
        resp = self.http_request("/process-image", "PUT")
        return self.parse_json(resp.text)

    def update_image(self, image_id: str, encoded_image: str, current_iterations: int, status: str) -> SimpleNamespace:
        body = {
            "label": "",
            "current_iterations": current_iterations,
            "phrases": [],
            "status": status,
            "encoded_image": encoded_image,
        }
        resp = self.http_request(f"/images/{image_id}", "PATCH", body)
        return self.parse_json(resp.text)

    def get_image_data(self, image_id: str) -> bytes:
        resp = self.http_request(f"/images/{image_id}/image.jpg", "GET")
        # read binary data
        return resp.content