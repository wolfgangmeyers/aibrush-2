import json
from types import SimpleNamespace
import random
import time

from api_client import AIBrushAPI

class Generation:
    def __init__(self, client: AIBrushAPI, workflow: SimpleNamespace, data_key="images"):
        self.data_key = data_key
        data = json.loads(workflow.data_json)
        self.client = client
        self.workflow = workflow
        if data_key not in data:
            data[data_key] = []
            self.workflow.data_json = json.dumps(data)
        self.images = [SimpleNamespace(**image) for image in data[self.data_key]]
        self.last_ping = time.time()

    def ping_if_needed(self):
        if time.time() - self.last_ping > self.workflow.execution_delay * 0.5:
            self.last_ping = time.time()
            self.client.update_workflow(self.workflow.id)

    def check_complete(self):
        data = json.loads(self.workflow.data_json)
        all_completed = True
        for i in range(len(self.images)):
            try:
                image = self.images[i]
                if image.status == "completed":
                    continue
                image = self.client.get_image(image.id)
                self.images[i] = image
                if image.status != "completed":
                    all_completed = False
                    break
            except Exception as inst:
                print(f"Error getting image {image.id}: {inst}")
            self.ping_if_needed()
        self.images.sort(key=lambda image: image.score, reverse=True)
        data[self.data_key] = [image.__dict__ for image in self.images]
        self.workflow.data_json = json.dumps(data)
        self.client.update_workflow(self.workflow.id, data_json=self.workflow.data_json)
        return all_completed

    def select_survivors(self, survivors_count):
        data = json.loads(self.workflow.data_json)
        # sort by image.score descending
        self.images.sort(key=lambda image: image.score, reverse=True)
        survivors = self.images[:survivors_count]
        non_survivors = self.images[survivors_count:]
        for image in non_survivors:
            self.client.delete_image(image.id)
            self.ping_if_needed()
        self.images = survivors
        data[self.data_key] = [image.__dict__ for image in survivors]
        self.workflow.data_json = json.dumps(data)
        self.client.update_workflow(self.workflow.id, data_json=self.workflow.data_json)

    def initialize_generation(self, generations: int, generation_size: int, args: dict, state: str):
        data = {
            "images": [],
            "display_images": [],
            "remaining_generations": generations,
        }
        for i in range(generation_size):
            image = self.client.create_image(**args)
            data["images"].append(image.__dict__)
            self.ping_if_needed()
        self.workflow.data_json = json.dumps(data)
        self.client.update_workflow(self.workflow.id, data_json=self.workflow.data_json, state=state)

    def update_data(self, key: str, value: any):
        data = json.loads(self.workflow.data_json)
        data[key] = value
        self.workflow.data_json = json.dumps(data)
        self.client.update_workflow(self.workflow.id, data_json=self.workflow.data_json)

    def _default_create_from_parent(self, parent):
        skip_iterations = random.randint(30, 45)
        while skip_iterations % 5 != 0:
            skip_iterations += 1
        return dict(
            parent=parent.id,
            label=parent.label,
            height=256,
            width=256,
            model="glid_3_xl",
            phrases=parent.phrases,
            negative_phrases=parent.negative_phrases,
            glid_3_xl_skip_iterations=skip_iterations,
        )

    def repopulate(self, count, create_from_parent=None):
        """
        create_from_parent: Accepts a parent image as SimpleNamespace and returns a dict
        of create_image parameters.
        """
        data = json.loads(self.workflow.data_json)
        if not create_from_parent:
            create_from_parent = self._default_create_from_parent
        for i in range(count):
            parent = self.images[i % len(self.images)]
            image = self.client.create_image(**create_from_parent(parent))
            self.images.append(image)
            self.ping_if_needed()
        data[self.data_key] = [image.__dict__ for image in self.images]
        self.workflow.data_json = json.dumps(data)
        self.client.update_workflow(self.workflow.id, data_json=self.workflow.data_json)