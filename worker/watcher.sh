#!/bin/bash

for i in $(screen -list | grep worker | awk '{print $5}'); do
    if [[ $i == *"(Dead"* ]]; then
        echo "Worker is dead, restarting"
        screen -wipe
        screen -m -d -S worker $(dirname "$0")/images_worker.sh
    else
        echo "Worker is alive"
    fi
done

# to run this script every 5 minutes, add this to crontab:
# */5 * * * * </path/to>/aibrush-2/worker/watcher.sh
