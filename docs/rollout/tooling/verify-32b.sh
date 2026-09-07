#!/bin/bash
export DATABASE_URL=postgresql://postgres@localhost:5433/huchu_test
export DATABASE_URL_TEST=postgresql://postgres@localhost:5433/huchu_test
export NODE_OPTIONS=--max-old-space-size=7168
cd /home/user/huchu/apps/crm
echo "== crm typecheck"; pnpm typecheck 2>&1 | tail -30; echo "TC_EXIT=${PIPESTATUS[0]}"
echo "== crm lint"; pnpm exec eslint . 2>&1 | grep -E "error|✖|problems" | head -40; echo "LINT_DONE"
echo "== crm tests"; pnpm exec vitest run 2>&1 | tail -15; echo "TEST_DONE"
echo "== crm build"; pnpm build > /tmp/claude-0/-home-user-huchu/eafc178b-2c3f-5a7f-bcbb-c8e593fa6116/scratchpad/build-32b.log 2>&1; echo "BUILD_EXIT=$?"; grep -E "Compiled|error|Error|Failed|pages|○|ƒ" /tmp/claude-0/-home-user-huchu/eafc178b-2c3f-5a7f-bcbb-c8e593fa6116/scratchpad/build-31c.log | grep -vE "^\s*(○|ƒ) " | head -30

cd /home/user/huchu/apps/legacy
echo "ALL_DONE"
