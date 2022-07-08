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

    def http_request(self, path, method, body=None, content_type=None) -> requests.Response:
        if not content_type:
            content_type = "application/json"
        url = f"{self.api_url}/api{path}"
        print(f"{method} {url}")
        backoff = 2
        for _ in range(5):
            try:
                if isinstance(body, bytes):
                    return requests.request(method, url, data=body, headers={
                        "Content-Type": content_type,
                        "Authorization": f"Bearer {self.token}",
                    }, timeout=10)
                return requests.request(method, url, json=body, headers={
                    "Content-Type": content_type,
                    "Authorization": f"Bearer {self.token}",
                }, timeout=30)
            except Exception as err:
                print(f"Error making request: {err}")
                time.sleep(backoff)
                backoff *= 2

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

    def update_image(self, image_id: str, encoded_image: str, encoded_npy: str, current_iterations: int, status: str, score: float, negative_score: float) -> SimpleNamespace:
        body = {
            "current_iterations": current_iterations,
            "status": status,
            "score": score,
            "negative_score": negative_score,
        }
        if encoded_image:
            body["encoded_image"] = encoded_image
        if encoded_npy:
            body["encoded_npy"] = encoded_npy
        resp = self.http_request(f"/images/{image_id}", "PATCH", body)
        return self.parse_json(resp.text)

    def get_image_data(self, image_id: str) -> bytes:
        resp = self.http_request(f"/images/{image_id}.image.jpg", "GET")
        if resp.status_code != 200:
            return None
        # read binary data
        return resp.content

    def get_mask_data(self, image_id: str) -> bytes:
        resp = self.http_request(f"/images/{image_id}.mask.jpg", "GET")
        if resp.status_code != 200:
            return None
        # read binary data
        return resp.content

    def get_npy_data(self, image_id: str) -> bytes:
        resp = self.http_request(f"/images/{image_id}.npy", "GET")
        if resp.status_code != 200:
            return None
        # read binary data
        return resp.content

    def update_video_data(self, image_id: str, video_data: bytes):
        resp = self.http_request(f"/images/{image_id}.mp4", "PUT", video_data, "video/mp4")
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

    # svg jobs
    def process_svg_job(self) -> SimpleNamespace:
        resp = self.http_request("/process-svg-job", "POST")
        return self.parse_json(resp.text)

    def update_svg_job(self, job_id: str, result: str) -> SimpleNamespace:
        body = {
            "result": result,
        }
        resp = self.http_request(f"/svg-jobs/{job_id}", "PATCH", body)
        return self.parse_json(resp.text)

    # Make all args default to None
    def create_image(
        self, phrases: List[str] = None,
        negative_phrases: List[str] = None,
        label: str = None,
        iterations: int = None,
        parent: str = None,
        encoded_image: str = None,
        encoded_mask: str = None,
        encoded_npy: str = None,
        enable_video: bool = None,
        enable_zoom: bool = None,
        zoom_frequency: int = None,
        zoom_scale: float = None,
        zoom_shift_x: float = None,
        zoom_shift_y: float = None,
        model: str = None,
        glid_3_xl_skip_iterations: int = None,
        glid_3_xl_clip_guidance: bool = None,
        glid_3_xl_clip_guidance_scale: float = None,
        height: int = None,
        width: int = None,
        uncrop_offset_x: int = None,
        uncrop_offset_y: int = None
    ) -> SimpleNamespace:
        body = {
            "phrases": [],
            "negative_phrases": [],
            "label": "",
            "iterations": 50,
            "encoded_image": "",
            "encoded_npy": "",
            "encoded_mask": "",
            "enable_video": False,
            "enable_zoom": False,
            "zoom_frequency": 10,
            "zoom_scale": 0.99,
            "zoom_shift_x": 0,
            "zoom_shift_y": 0,
            "model": "glid_3_xl",
            "glid_3_xl_clip_guidance": False,
            "glid_3_xl_clip_guidance_scale": 150,
            "glid_3_xl_skip_iterations": 0,
            "width": 256,
            "height": 256,
        }
        if phrases is not None:
            body["phrases"] = phrases
        if negative_phrases is not None:
            body["negative_phrases"] = negative_phrases
        if label is not None:
            body["label"] = label
        if iterations is not None:
            body["iterations"] = iterations
        if parent is not None:
            body["parent"] = parent
        if encoded_image is not None:
            body["encoded_image"] = encoded_image
        if encoded_mask is not None:
            body["encoded_mask"] = encoded_mask
        if encoded_npy is not None:
            body["encoded_npy"] = encoded_npy
        if enable_video is not None:
            body["enable_video"] = enable_video
        if enable_zoom is not None:
            body["enable_zoom"] = enable_zoom
        if zoom_frequency is not None:
            body["zoom_frequency"] = zoom_frequency
        if zoom_scale is not None:
            body["zoom_scale"] = zoom_scale
        if zoom_shift_x is not None:
            body["zoom_shift_x"] = zoom_shift_x
        if zoom_shift_y is not None:
            body["zoom_shift_y"] = zoom_shift_y
        if model is not None:
            body["model"] = model
        if glid_3_xl_clip_guidance is not None:
            body["glid_3_xl_clip_guidance"] = glid_3_xl_clip_guidance
        if glid_3_xl_clip_guidance_scale is not None:
            body["glid_3_xl_clip_guidance_scale"] = glid_3_xl_clip_guidance_scale
        if glid_3_xl_skip_iterations is not None:
            body["glid_3_xl_skip_iterations"] = glid_3_xl_skip_iterations
        if height is not None:
            body["height"] = height
        if width is not None:
            body["width"] = width
        if uncrop_offset_x is not None:
            body["uncrop_offset_x"] = uncrop_offset_x
        if uncrop_offset_y is not None:
            body["uncrop_offset_y"] = uncrop_offset_y
        resp = self.http_request("/images", "POST", body)
        return self.parse_json(resp.text)

    def delete_image(self, image_id: str) -> bool:
        resp = self.http_request(f"/images/{image_id}", "DELETE")
        return resp.status_code == 204

    def get_image(self, image_id: str) -> SimpleNamespace:
        resp = self.http_request(f"/images/{image_id}", "GET")
        return self.parse_json(resp.text)

    def process_workflow(self) -> SimpleNamespace:
        resp = self.http_request("/process-workflow", "PUT")
        return self.parse_json(resp.text)

    def update_workflow(
        self, workflow_id: str=None,
        label: str=None,
        data_json: str=None,
        config_json: str=None,
        is_active: bool=None,
        state: str=None,
        execution_delay: int=None,
    ) -> SimpleNamespace:
        body = {}
        if label:
            body["label"] = label
        if data_json:
            body["data_json"] = data_json
        if config_json:
            body["config_json"] = config_json
        if is_active != None:
            body["is_active"] = is_active
        if state:
            body["state"] = state
        if execution_delay:
            body["execution_delay"] = execution_delay
        resp = self.http_request(f"/workflows/{workflow_id}", "PUT", body)
        return self.parse_json(resp.text)

