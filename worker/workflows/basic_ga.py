import json
import random
from types import SimpleNamespace

from api_client import AIBrushAPI
from workflows.generation import Generation

def basic_ga(client: AIBrushAPI, workflow: SimpleNamespace):
    
    generation = Generation(client, workflow, data_key="images")

    config = json.loads(workflow.config_json)
    if workflow.state == "init":
        print(f"Starting workflow {workflow.id}")
        data = {
            "images": [],
            "display_images": [],
            "remaining_generations": config["generations"],
        }
        parent = None
        skip_iterations = 0
        # encoded_image_data = None
        width = 256
        height = 256
        if "parent" in config:
            parent = config["parent"]
            # skip_iterations random number between 30 and 45
            # round to the nearest 5
            skip_iterations = random.randint(30, 45)
            while skip_iterations % 5 != 0:
                skip_iterations += 1
            parent_data = client.get_image(parent)
            width = parent_data.width
            height = parent_data.height
        # TODO: use initialize_generation function instead
        for i in range(config["generation_size"]):
            image = client.create_image(
                # encoded_image=encoded_image_data,
                parent = parent,
                iterations=50,
                label=workflow.label,
                height=height,
                width=width,
                model="glid_3_xl",
                phrases=config["phrases"].split("|"),
                negative_phrases=config["negative_phrases"].split("|"),
                glid_3_xl_skip_iterations=skip_iterations,
            )
            data["images"].append(image.__dict__)
            generation.ping_if_needed()
        client.update_workflow(workflow.id, data_json=json.dumps(data), state="running")
    elif workflow.state == "running":
        print(f"Processing workflow {workflow.id}")
        all_completed = generation.check_complete()
        data = json.loads(workflow.data_json)
        remaining_generations = data["remaining_generations"]
        state = workflow.state
        is_active = workflow.is_active
        keep_count = config["keep_count"]
        generation.update_data("display_images", data["images"][:keep_count])
        if all_completed:
            
            generation_size = config["generation_size"]
            print("generation completed")

            generation.select_survivors(keep_count)

            remaining_generations -= 1
            if remaining_generations == 0:
                is_active = False
                state = "completed"
            else:
                generation.repopulate(generation_size)
            
            generation.update_data("remaining_generations", remaining_generations)
            
        else:
            print("generation not completed")
        client.update_workflow(workflow.id, is_active=is_active, state=state)