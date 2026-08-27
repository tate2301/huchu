#!/usr/bin/env bash
# Clean A/B harness for dev-server cold compile.
# Usage: bash scratch/bench-dev.sh <label> <port>
set -u
LABEL="$1"
PORT="${2:-3300}"
cd /c/Users/pc/work/huchu

# make sure nothing else is competing
pkill -f "next dev" 2>/dev/null
pkill -f "next-server" 2>/dev/null
sleep 3

rm -rf .next
LOG="scratch/bench-$LABEL.log"
: > "$LOG"

npx next dev --port "$PORT" > "$LOG" 2>&1 &
DEVPID=$!

# wait for ready
for i in $(seq 1 120); do
  if grep -q "Ready in" "$LOG" 2>/dev/null; then break; fi
  sleep 2
done
READY=$(grep -o "Ready in [0-9.]*s" "$LOG" | head -1)

# cold compile of /login
COLD=$(curl -s -o /dev/null -w "%{time_total}" --max-time 500 "http://localhost:$PORT/login")
CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 200 "http://localhost:$PORT/login")
WARM=$(curl -s -o /dev/null -w "%{time_total}" --max-time 200 "http://localhost:$PORT/login")

# peak memory of the node tree
MEM=$(powershell -NoProfile -Command "(Get-Process node -ErrorAction SilentlyContinue | Measure-Object WorkingSet64 -Sum).Sum/1GB" 2>/dev/null | tr -d '\r')

echo "───────────────────────────────────────"
echo "LABEL      : $LABEL"
echo "$READY"
echo "cold /login: ${COLD}s  (http $CODE)"
echo "warm /login: ${WARM}s"
echo "node RSS   : ${MEM} GB"
grep -o "compile: [0-9.]*\(s\|min\)" "$LOG" | head -2
echo "───────────────────────────────────────"

kill $DEVPID 2>/dev/null
pkill -f "next dev" 2>/dev/null
pkill -f "next-server" 2>/dev/null
sleep 2
