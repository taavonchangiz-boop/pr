#!/bin/bash
cd /home/z/my-project
while true; do
  if ! pgrep -f "next-server" > /dev/null 2>&1; then
    echo "[$(date '+%H:%M:%S')] dev server not running, starting..." >> .zscripts/watchdog.log
    bun run dev >> dev.log 2>&1 &
    DEV_PID=$!
    echo "[$(date '+%H:%M:%S')] started PID $DEV_PID" >> .zscripts/watchdog.log
    wait $DEV_PID
    echo "[$(date '+%H:%M:%S')] dev server exited (code $?), restarting in 3s..." >> .zscripts/watchdog.log
    sleep 3
  else
    sleep 5
  fi
done
