#!/bin/bash
find . -name 'cron-configfile.txt' -print0 | 
    while IFS= read -r -d $'\0' line; do 
        content=$(cat $line)
        sudo /usr/bin/icecast2 -b -c ${content}
        echo "Running ${content}"
        rm -rf $line
    done