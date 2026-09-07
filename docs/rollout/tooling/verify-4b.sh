#!/bin/bash
export DATABASE_URL=postgresql://postgres@localhost:5433/huchu_test
export DATABASE_URL_TEST=postgresql://postgres@localhost:5433/huchu_test
export NODE_OPTIONS=--max-old-space-size=7168
cd /home/user/huchu/packages/platform
echo "== platform typecheck"; pnpm typecheck 2>&1 | grep -E "error TS" | head; echo "TC_EXIT=${PIPESTATUS[0]}"
echo "== platform lint"; pnpm exec eslint . 2>&1 | grep -E "error|✖|problems" | head; echo "LINT_DONE"
echo "== platform tests"; pnpm exec vitest run 2>&1 | grep -E "Test Files|Tests |FAIL|×" | head; echo "TEST_DONE"
cd /home/user/huchu/apps/enterprise
echo "== enterprise typecheck"; pnpm typecheck 2>&1 | grep -E "error TS" | head; echo "ENT_TC_EXIT=${PIPESTATUS[0]}"
echo "== enterprise lint (changed)"; pnpm exec eslint lib/marketing/pricing.ts lib/marketing/pricing.test.ts components/admin-portal/wizards/platform-wizards.tsx 2>&1 | grep -E "error|✖|problems" | head; echo "ENT_LINT_DONE"
echo "== enterprise tests"; pnpm exec vitest run 2>&1 | grep -E "Test Files|Tests |FAIL|×" | head; echo "ENT_TEST_DONE"
echo "== enterprise build"; (pnpm turbo run build --filter=@corelithzw/enterprise > /tmp/claude-0/-home-user-huchu/eafc178b-2c3f-5a7f-bcbb-c8e593fa6116/scratchpad/build-4b.log 2>&1); echo "BUILD_EXIT=$?"
echo "ALL_DONE"
