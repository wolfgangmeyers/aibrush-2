import json
from types import SimpleNamespace
import random
import time

from api_client import AIBrushAPI

def _ping(client: AIBrushAPI, workflow: SimpleNamespace):
    print(f"Pinging workflow {workflow.id}")
    client.update_workflow(workflow.id, state="running")

def basic_ga(client: AIBrushAPI, workflow: SimpleNamespace):
    last_ping = time.time()
    is_active = True
    state = workflow.state

    def _ping_if_needed():
        nonlocal last_ping
        if time.time() - last_ping > workflow.execution_delay * 0.5:
            last_ping = time.time()
            _ping(client, workflow)

    config = json.loads(workflow.config_json)
    if workflow.state == "init":
        print(f"Starting workflow {workflow.id}")
        data = {
            "images": [],
            "display_images": [],
            "remaining_generations": config["generations"],
        }
        for i in range(config["generation_size"]):
            image = client.create_image(
                iterations=50,
                label=workflow.label,
                height=256,
                width=256,
                model="glid_3_xl",
                phrases=config["phrases"].split("|"),
                negative_phrases=config["negative_phrases"].split("|"),
            )
            data["images"].append(image.__dict__)
            _ping_if_needed()
        client.update_workflow(workflow.id, data_json=json.dumps(data), state="running")
    elif workflow.state == "running":
        print(f"Processing workflow {workflow.id}")
        data = json.loads(workflow.data_json)
        remaining_generations = data["remaining_generations"]
        all_completed = True
        images = []
        for i in range (len(data["images"])):
            image_item = data["images"][i]
            image = SimpleNamespace(**image_item)
            try:
                if image.status != "completed":
                    image = client.get_image(image.id)
                    if image.status != "completed":
                        all_completed = False
                        break
                images.append(image)
                data["images"][i] = image.__dict__
                _ping_if_needed()
            except Exception as inst:
                print(f"Error getting image {image.id}: {inst}")
        # sort images by score descending
        images.sort(key=lambda x: x.score, reverse=True)
        keep_images = images[:config["keep_count"]]
        data["display_images"] = [img.__dict__ for img in keep_images]
        if all_completed:
            print("generation completed")

            discard_images = images[config["keep_count"]:]
            new_images = []
            for image in keep_images:
                new_images.append(image)
            for image in discard_images:
                try:
                    client.delete_image(image.id)
                    _ping_if_needed()
                except:
                    pass # already deleted
            remaining_generations -= 1
            if remaining_generations == 0:
                is_active = False
                state = "completed"
            else:
                for i in range(config["generation_size"]):
                    
                    parent = keep_images[i % len(keep_images)].id
                    skip_iterations = random.randint(30, 45)
                    while skip_iterations % 5 != 0:
                        skip_iterations += 1
                    image = client.create_image(
                        parent=parent,
                        label=workflow.label,
                        height=256,
                        width=256,
                        model="glid_3_xl",
                        phrases=config["phrases"].split("|"),
                        negative_phrases=config["negative_phrases"].split("|"),
                        glid_3_xl_skip_iterations=skip_iterations,
                    )
                    new_images.append(image)
                    _ping_if_needed()
            
            data["images"] = [img.__dict__ for img in new_images]
            
            data["remaining_generations"] = remaining_generations
        else:
            print("generation not completed")
        client.update_workflow(workflow.id, data_json=json.dumps(data), is_active=is_active, state=state)