#!/bin/bash

# To restart worker if it died:
# screen -m -d -S worker $(dirname "$0")/images_worker.sh

# example output from screen when the worker has died:
# $ screen -list
# There is a screen on:
# 	193854.worker	(10/23/2022 08:00:23 PM)	(Dead ???)

# Run the screen -list command and check for dead worker
# If it is dead, restart it
# If it is not dead, do nothing

cd ""

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