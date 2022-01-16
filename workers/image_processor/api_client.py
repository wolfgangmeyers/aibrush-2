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
        url = f"{self.api_url}/api{path}"
        for i in range(2):
            try:
                if isinstance(body, bytes):
                    return requests.request(method, url, data=body, headers={
                        "Content-Type": "video/mp4",
                        "Authorization": f"Bearer {self.token}",
                    })
                return requests.request(method, url, json=body, headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {self.token}",
                })
            except Exception as err:
                print(f"Error making http request: {err}")
                time.sleep(5)

    def parse_json(self, json_str):
        try:
            return json.loads(json_str, object_hook=lambda d: SimpleNamespace(**d))
        except Exception as err:
            print(f"Error parsing json: {err}")
            raise err
            return None

    def process_image(self, zoom_supported: bool) -> SimpleNamespace:
        resp = self.http_request("/process-image", "PUT", body={
            "zoom_supported": zoom_supported,
        })
        print(resp.text)
        return self.parse_json(resp.text)

    def login(self, email: str) -> SimpleNamespace:
        body = {
            "email": email,
        }
        self.http_request("/auth/login", "POST", body)

    def verify_login(self, email: str, code: str) -> SimpleNamespace:
        body = {
            "email": email,
            "code": code,
        }
        resp = self.http_request("/auth/verify", "POST", body)
        return self.parse_json(resp.text)

    def update_image(self, image_id: str, encoded_image: str, current_iterations: int, status: str) -> SimpleNamespace:
        body = {
            "current_iterations": current_iterations,
            "status": status,
            "encoded_image": encoded_image,
        }
        resp = self.http_request(f"/images/{image_id}", "PATCH", body)
        return self.parse_json(resp.text)

    def get_image_data(self, image_id: str) -> bytes:
        resp = self.http_request(f"/images/{image_id}/image.jpg", "GET")
        # read binary data
        return resp.content

    def update_video_data(self, image_id: str, video_data: bytes):
        resp = self.http_request(f"/images/{image_id}/video.mp4", "PUT", video_data)
        if resp.status_code != 204:
            print(f"Error updating video data ({resp.status_code}): {resp.text}")
            return False