import sys
import json
import time
import traceback

from api_client import AIBrushAPI
from workflows.basic_ga import basic_ga
from workflows.parallel_ga import parallel_ga

api_url = "https://www.aibrush.art"
if len(sys.argv) > 1:
    api_url = sys.argv[1]

# load credentials.json
with open('credentials.json') as f:
    access_token = json.load(f)["accessToken"]

client = AIBrushAPI(api_url, access_token)

workflow_handlers = {
    "basic_ga": basic_ga,
    "parallel_ga": parallel_ga,
}

def process_workflow() -> bool:
    try:
        workflow = client.process_workflow()
        if not workflow:
            print("No workflow to process")
            return
        print(f"Processing workflow {workflow.id}")
        if workflow.workflow_type not in workflow_handlers:
            print(f"Unknown workflow type: {workflow.workflow_type}")
            return
        workflow_handlers[workflow.workflow_type](client, workflow)
        return True
    except Exception as err:
        print(f"Error processing workflow: {err}")
        traceback.print_exc()
        return False

if __name__ == "__main__":
    backoff = 1
    while True:
        if process_workflow():
            backoff = 1
            time.sleep(0.1)
        else:
            if backoff < 10:
                backoff *= 2
            time.sleep(backoff)
