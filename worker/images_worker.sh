#!/bin/bash

# cd into same folder as the script
cd "$(dirname "$0")"
while true; do
    # run the worker
    . ../../venv/bin/activate
    python images_worker.py
    # if the worker exits, sleep for 5 seconds and try again
    echo "Worker exited, restarting in 5 seconds"
    sleep 5
done

# crontab -e
# enter the following line, with the path to the script fixed:
# @reboot screen -m -d -S worker /path/to/worker/images_worker.sh