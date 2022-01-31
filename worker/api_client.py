import requests
import sys
from types import SimpleNamespace
from typing import List
import time
import json

class AIBrushAPI(object):
    def __init__(self, api_url: str, token: str):
        self.api_url = api_url
        self.token = token

    def http_request(self, path, method, body=None) -> requests.Response:
        url = f"{self.api_url}/api{path}"
        print(f"{method} {url}")
        backoff = 2
        for _ in range(5):
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
                # is this a connection error?
                if isinstance(err, requests.exceptions.ConnectionError):
                    print(f"Connection error: {err}")
                    time.sleep(backoff)
                    backoff *= 2
                else:
                    raise err

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
        resp = self.http_request(f"/images/{image_id}.image.jpg", "GET")
        # read binary data
        return resp.content

    def update_video_data(self, image_id: str, video_data: bytes):
        resp = self.http_request(f"/images/{image_id}.video.mp4", "PUT", video_data)
        if resp.status_code != 204:
            print(f"Error updating video data ({resp.status_code}): {resp.text}")
            return False

    def process_suggestion_job(self) -> SimpleNamespace:
        resp = self.http_request("/process-suggestion-job", "POST")
        return self.parse_json(resp.text)

    def update_suggestions_job(self, job_id: str, status: str, result: List[str]) -> SimpleNamespace:
        body = {
            "status": status,
            "result": result,
        }
        resp = self.http_request(f"/suggestions-jobs/{job_id}", "PATCH", body)
        return self.parse_json(resp.text)

    def get_suggestion_seed(self, seed_id: str) -> SimpleNamespace:
        resp = self.http_request(f"/suggestion-seeds/{seed_id}", "GET")
        # print response code and text
        print(f"{resp.status_code}: {resp.text}")
        return self.parse_json(resp.text)
