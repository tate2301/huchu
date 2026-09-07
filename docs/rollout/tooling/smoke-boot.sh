#!/usr/bin/env bash
# Boot smoke: does instrumentation.ts fill the kernel's registries before the first request?
# A guarded page must redirect (no session) rather than 500 with "No auth options registered".
set -u
cd /home/user/huchu/apps/legacy
PORT=${PORT:-3105}
LOG=/tmp/claude-0/-home-user-huchu/eafc178b-2c3f-5a7f-bcbb-c8e593fa6116/scratchpad/smoke-server.log
export DATABASE_URL=postgresql://postgres@localhost:5433/huchu_test
export NEXTAUTH_SECRET=${NEXTAUTH_SECRET:-smoke-test-secret-not-for-production}
export NEXTAUTH_URL=http://localhost:$PORT
export PLATFORM_ROOT_DOMAIN=${PLATFORM_ROOT_DOMAIN:-localhost}
export NODE_ENV=production
node_modules/.bin/next start -p $PORT > "$LOG" 2>&1 &
PID=$!
for i in $(seq 1 60); do
  if curl -s -o /dev/null "http://localhost:$PORT/api/v2/health"; then break; fi
  sleep 1
done
probe() { # method path expected-description
  code=$(curl -s -o /tmp/smoke-body -w '%{http_code}' -H "Host: ${3:-localhost:$PORT}" "http://localhost:$PORT$2" -X "$1")
  loc=$(curl -s -o /dev/null -w '%{redirect_url}' -H "Host: ${3:-localhost:$PORT}" "http://localhost:$PORT$2" -X "$1")
  printf '%-6s %-40s -> %s %s\n' "$1" "$2" "$code" "$loc"
}
probe GET /api/v2/health
probe GET /api/users
probe GET /api/notifications
probe GET /preferences/organization/users
probe GET /preferences/organization
probe GET /dashboard
probe GET /login
kill $PID 2>/dev/null; wait $PID 2>/dev/null
echo "--- server log: registry errors? ---"
grep -nE 'No auth options registered|registerAuthOptions|UNKNOWN_PERMISSION|Error:' "$LOG" | head -10 || true
echo "--- server log tail ---"; tail -5 "$LOG"
