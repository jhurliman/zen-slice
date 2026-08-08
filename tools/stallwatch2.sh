#!/bin/sh
# stallwatch2.sh — detached stall daemon, v2.
#
# Supersedes tools/stallwatch.sh. Do NOT edit a running copy of either: `sh`
# reads a script by byte offset as it executes, so editing in place can make a
# live daemon jump into the middle of a line. Always write a NEW file and swap.
#
# WHY THIS EXISTS
# The Monitor tool's lifetime is capped at ~30 min (persistent:true is not
# honoured in this build — observed three times). So the schedule cannot live
# inside a monitor: a 2-hour poll in a 30-minute process never fires once.
# The schedule lives here; the monitor is a dumb `tail -F` of the log.
#
# WHAT v2 ADDS: a heartbeat file.
# The log only receives STALL/ERROR lines plus a 2-hourly PULSE. Between pulses
# an empty log is ambiguous — "healthy and quiet" and "daemon is dead" look
# identical, which is the exact failure mode this whole watch exists to avoid.
# So every cycle also rewrites rounds/.stallwatch-heartbeat with a timestamp.
# That file's mtime is checkable with a read-only tool (no shell required, which
# matters when the Bash classifier is unavailable): if it is older than ~15
# minutes, the daemon is dead, regardless of how quiet the log is.
#
# Cadence: check every 10 min. PULSE every 2 hours (12 cycles).

cd /home/claude/juice || exit 1
LOG=rounds/stall.log
BEAT=rounds/.stallwatch-heartbeat
i=0

while true; do
  line=$(node tools/stallcheck.mjs 2>&1) || line="ERROR  stallcheck failed to run"

  # Heartbeat first, so liveness is recorded even if the check itself is unhappy.
  printf '%s pid=%s cycle=%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$$" "$i" "$line" > "$BEAT"

  case "$line" in
    *STALL*|*ERROR*) echo "$line" >> "$LOG" ;;
  esac
  if [ $((i % 12)) -eq 0 ]; then echo "PULSE  $line" >> "$LOG"; fi

  i=$((i + 1))
  sleep 600
done
