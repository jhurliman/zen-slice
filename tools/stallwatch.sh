#!/bin/sh
# stallwatch.sh — detached stall daemon.
#
# The Monitor tool's lifetime is capped (~30-60 min), so a 2-hour poll *inside*
# a monitor can never fire. The schedule therefore lives here, in a process that
# outlives any single monitor, and the monitor becomes a dumb tail of this log.
# If the monitor dies, nothing is lost — events keep accumulating in the file.
#
# Cadence: check every 10 min. Append only STALL/ERROR lines, plus a PULSE line
# every 2 hours so "the watch is alive" is itself observable.
cd /home/claude/juice || exit 1
LOG=rounds/stall.log
i=0
while true; do
  line=$(node tools/stallcheck.mjs 2>&1) || line="ERROR  stallcheck failed to run"
  case "$line" in
    *STALL*|*ERROR*) echo "$line" >> "$LOG" ;;
  esac
  if [ $((i % 12)) -eq 0 ]; then echo "PULSE  $line" >> "$LOG"; fi
  i=$((i + 1))
  sleep 600
done
