#!/bin/bash
export DATABASE_URL=postgresql://postgres@localhost:5433/huchu_test
export DATABASE_URL_TEST=postgresql://postgres@localhost:5433/huchu_test
export NODE_OPTIONS=--max-old-space-size=7168
cd /home/user/huchu/apps/sell
echo "== sell typecheck"; pnpm typecheck 2>&1 | tail -30; echo "TC_EXIT=${PIPESTATUS[0]}"
echo "== sell lint"; pnpm exec eslint . 2>&1 | grep -E "error|✖|problems" | head -40; echo "LINT_DONE"
echo "== sell tests"; pnpm exec vitest run 2>&1 | tail -15; echo "TEST_DONE"
echo "== sell build"; pnpm build > /tmp/claude-0/-home-user-huchu/eafc178b-2c3f-5a7f-bcbb-c8e593fa6116/scratchpad/build-32a.log 2>&1; echo "BUILD_EXIT=$?"; grep -E "Compiled|error|Error|Failed|pages|○|ƒ" /tmp/claude-0/-home-user-huchu/eafc178b-2c3f-5a7f-bcbb-c8e593fa6116/scratchpad/build-31c.log | grep -vE "^\s*(○|ƒ) " | head -30

cd /home/user/huchu/apps/legacy
echo "== legacy typecheck"; pnpm typecheck 2>&1 | grep -E "error TS" | head; echo "LEGACY_TC_EXIT=${PIPESTATUS[0]}"
echo "== sell module boundary + legacy host tests"; (cd /home/user/huchu/packages/modules/sell && pnpm exec vitest run module-boundary.test.ts 2>&1 | grep -E "Test Files|Tests |FAIL"); pnpm exec vitest run lib/host/manifests.test.ts lib/host/workspace-feature-resolution.test.ts lib/host/retail-areas.test.ts 2>&1 | grep -E "Test Files|Tests |FAIL"; echo "LEGACY_TEST_DONE"
echo "ALL_DONE"
