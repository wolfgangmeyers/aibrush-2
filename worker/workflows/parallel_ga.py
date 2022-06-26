import json
from types import SimpleNamespace

from api_client import AIBrushAPI
from workflows.generation import Generation
import random

def parallel_ga(client: AIBrushAPI, workflow: SimpleNamespace):
    
    # generation = Generation(client, workflow, data_key="images")
    print(f"Parallel Genetic Algorithm: Processing workflow {workflow.id} in state {workflow.state}")
    config = SimpleNamespace(**json.loads(workflow.config_json))

    def create_from_parent(parent):
        skip_iterations = random.randint(30, 45)
        while skip_iterations % 5 != 0:
            skip_iterations += 1
        return dict(
            parent=parent.id,
            label=parent.label,
            height=256,
            width=256,
            model=config.parallel_model,
            phrases=parent.phrases,
            negative_phrases=parent.negative_phrases,
            glid_3_xl_skip_iterations=skip_iterations,
        )

    if workflow.state == "init":
        generation = Generation(client, workflow, data_key="images")
        parent = None
        skip_iterations = 0
        # encoded_image_data = None
        if "parent" in config:
            parent = config["parent"]
            # skip_iterations random number between 30 and 45
            # round to the nearest 5
            skip_iterations = random.randint(30, 45)
            while skip_iterations % 5 != 0:
                skip_iterations += 1
        generation.initialize_generation(config.generations, config.initial_generation_size, dict(
            parent=parent,
            iterations=50,
            label=workflow.label,
            height=256,
            width=256,
            model=config.initial_model,
            phrases=config.phrases.split("|"),
            negative_phrases=config.negative_phrases.split("|"),
            glid_3_xl_skip_iterations=skip_iterations,
        ), "initial_generation")
        print(f"Parallel Genetic Algorithm: Initial generation created")
    elif workflow.state == "initial_generation":
        initial_generation = Generation(client, workflow, data_key="images")
        all_completed = initial_generation.check_complete()
        data = json.loads(workflow.data_json)
        # remaining_generations = generation.data["remaining_generations"]
        state = workflow.state
        is_active = workflow.is_active
        keep_count = config.initial_keep_count
        initial_generation.update_data("display_images", data["images"][:keep_count])
        if all_completed:
            
            # generation_size = config.generation_size
            print("initial generation completed")

            initial_generation.select_survivors(keep_count)
            data = json.loads(workflow.data_json)
            for i in range(keep_count):
                data_key = f"parallel_generation_{i}"
                survivor = data["images"][i]
                data[data_key] = [survivor]

            workflow.data_json = json.dumps(data)
            for i in range(keep_count):
                data_key = f"parallel_generation_{i}"
                generation = Generation(client, workflow, data_key=data_key)
                generation.repopulate(config.parallel_generation_size, create_from_parent=create_from_parent)
            state = "parallel_generation"
        else:
            print("initial generation not completed")
        client.update_workflow(workflow.id, is_active=is_active, state=state)
    elif workflow.state == "parallel_generation":
        parallel_generation_count = config.initial_keep_count
        all_completed = True
        generations = []
        for i in range(parallel_generation_count):
            data_key = f"parallel_generation_{i}"
            generation = Generation(client, workflow, data_key=data_key)
            all_completed = generation.check_complete() and all_completed
            generations.append(generation)
        state = workflow.state
        is_active = workflow.is_active
        keep_count = config.parallel_keep_count
        all_display_images = []
        data = json.loads(workflow.data_json)
        for i in range(parallel_generation_count):
            data_key = f"parallel_generation_{i}"
            display_images = data[data_key][:keep_count]
            all_display_images.extend(display_images)
        generations[0].update_data("display_images", all_display_images)
        
        if all_completed:
            print("parallel generations completed")
            remaining_generations = data["remaining_generations"]
            remaining_generations -= 1
            for generation in generations:
                generation.select_survivors(config.parallel_keep_count)
            if remaining_generations == 0:
                print("workflow completed")
                is_active = False
                state = "completed"
                client.update_workflow(workflow.id, is_active=is_active, state=state)
            else:
                for generation in generations:
                    generation.repopulate(config.parallel_generation_size, create_from_parent=create_from_parent)
            generations[0].update_data("remaining_generations", remaining_generations)
