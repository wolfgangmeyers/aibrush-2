#!/bin/bash
echo "Checking worker"
for i in $(screen -list); do
    #echo $i
    if [[ $i == *"(Dead"* || $i == *"Sockets"* ]]; then
        echo "Worker is dead, restarting"
        screen -wipe
        screen -m -d -S worker $(dirname "$0")/worker.sh
        break
        #echo "Worker is alive"
    fi
done

# to run this script every 5 minutes, add this to crontab:
# */5 * * * * </path/to>/watcher.sh