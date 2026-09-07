#!/bin/bash
export DATABASE_URL=postgresql://postgres@localhost:5433/huchu_test
export DATABASE_URL_TEST=postgresql://postgres@localhost:5433/huchu_test
export NODE_OPTIONS=--max-old-space-size=7168
cd /home/user/huchu/packages/db; echo "== db typecheck"; pnpm typecheck 2>&1 | grep -E "error TS" | head; echo "DB_TC_EXIT=${PIPESTATUS[0]}"
cd /home/user/huchu/packages/platform
echo "== platform typecheck"; pnpm typecheck 2>&1 | grep -E "error TS" | head; echo "TC_EXIT=${PIPESTATUS[0]}"
echo "== platform lint"; pnpm exec eslint . 2>&1 | grep -E "error|✖|problems" | head; echo "LINT_DONE"
echo "== platform tests"; pnpm exec vitest run 2>&1 | grep -E "Test Files|Tests |FAIL|×" | head; echo "TEST_DONE"
cd /home/user/huchu/packages/shell
echo "== shell typecheck"; pnpm typecheck 2>&1 | grep -E "error TS" | head; echo "SHELL_TC_EXIT=${PIPESTATUS[0]}"
echo "== shell lint"; pnpm exec eslint . 2>&1 | grep -E "error|✖|problems" | head; echo "SHELL_LINT_DONE"
for h in campus sell crm people; do cd /home/user/huchu/apps/$h; echo "== $h typecheck"; pnpm typecheck 2>&1 | grep -E "error TS" | head; echo "${h}_TC_EXIT=${PIPESTATUS[0]}"; done
cd /home/user/huchu/apps/enterprise
echo "== enterprise typecheck"; pnpm typecheck 2>&1 | grep -E "error TS" | head; echo "ENT_TC_EXIT=${PIPESTATUS[0]}"
echo "== enterprise tests"; pnpm exec vitest run 2>&1 | grep -E "Test Files|Tests |FAIL|×" | head; echo "ENT_TEST_DONE"
echo "== enterprise build"; (pnpm turbo run build --filter=@corelithzw/enterprise > /tmp/claude-0/-home-user-huchu/eafc178b-2c3f-5a7f-bcbb-c8e593fa6116/scratchpad/build-5b.log 2>&1); echo "BUILD_EXIT=$?"
echo "ALL_DONE"
