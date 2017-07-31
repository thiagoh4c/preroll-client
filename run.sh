#!/bin/bash
find / -name 'cron-configfile.txt' -print0 | 
    while IFS= read -r -d $'\0' line; do 
        content=$(cat $line)
        sudo -u mediacp nohup /usr/local/mediacp/icecast2/bin/icecast -c ${content} > /dev/null &
        echo "Running ${content}"
        rm -rf $line
    done
