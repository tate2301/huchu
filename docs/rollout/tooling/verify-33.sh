#!/bin/bash
export DATABASE_URL=postgresql://postgres@localhost:5433/huchu_test
export DATABASE_URL_TEST=postgresql://postgres@localhost:5433/huchu_test
export NODE_OPTIONS=--max-old-space-size=7168
cd /home/user/huchu/packages/platform
echo "== platform typecheck"; pnpm typecheck 2>&1 | grep -E "error TS" | head; echo "TC_EXIT=${PIPESTATUS[0]}"
echo "== platform lint"; pnpm exec eslint . 2>&1 | grep -E "error|✖|problems" | head; echo "LINT_DONE"
echo "== platform tests"; pnpm exec vitest run 2>&1 | grep -E "Test Files|Tests |FAIL|✗|×" | head -20; echo "TEST_DONE"
cd /home/user/huchu/packages/modules/sell
echo "== sell pos-host tests"; pnpm exec vitest run pos-host-pages.test.ts module-boundary.test.ts 2>&1 | grep -E "Test Files|Tests |FAIL" ; echo "SELL_DONE"
cd /home/user/huchu/apps/legacy
echo "== legacy typecheck"; pnpm typecheck 2>&1 | grep -E "error TS" | head; echo "LEGACY_TC_EXIT=${PIPESTATUS[0]}"
echo "== legacy host tests"; pnpm exec vitest run lib/host/enforcement.test.ts lib/host/session-ssr.test.ts lib/host/manifests.test.ts 2>&1 | grep -E "Test Files|Tests |FAIL"; echo "LEGACY_TEST_DONE"
echo "== legacy build"; (pnpm turbo run build --filter=@corelithzw/legacy > /tmp/claude-0/-home-user-huchu/eafc178b-2c3f-5a7f-bcbb-c8e593fa6116/scratchpad/build-33.log 2>&1); echo "BUILD_EXIT=$?"
echo "ALL_DONE"
