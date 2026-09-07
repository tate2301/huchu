#!/bin/bash
export DATABASE_URL=postgresql://postgres@localhost:5433/huchu_test
export DATABASE_URL_TEST=postgresql://postgres@localhost:5433/huchu_test
export NODE_OPTIONS=--max-old-space-size=7168
cd /home/user/huchu
echo "== root scripts"; pnpm enterprise platform:audit-feature-gates 2>&1 | tail -3; echo "AUDIT_EXIT=${PIPESTATUS[0]}"
echo "== module boundaries (campus, gold)"; (cd packages/modules/campus && pnpm exec vitest run module-boundary.test.ts 2>&1 | grep -E "Test Files|FAIL"); (cd packages/modules/gold && pnpm exec vitest run module-boundary.test.ts 2>&1 | grep -E "Test Files|FAIL"); echo "BOUNDARY_DONE"
cd /home/user/huchu/apps/enterprise
echo "== enterprise typecheck"; pnpm typecheck 2>&1 | grep -E "error TS" | head; echo "TC_EXIT=${PIPESTATUS[0]}"
echo "== enterprise scripts typecheck"; pnpm typecheck:scripts 2>&1 | grep -E "error TS" | head; echo "SCRIPTS_EXIT=${PIPESTATUS[0]}"
echo "== enterprise tests"; pnpm exec vitest run 2>&1 | grep -E "Test Files|Tests |FAIL"; echo "TEST_DONE"
echo "== enterprise build"; (pnpm turbo run build --filter=@corelithzw/enterprise > /tmp/claude-0/-home-user-huchu/eafc178b-2c3f-5a7f-bcbb-c8e593fa6116/scratchpad/build-4a.log 2>&1); echo "BUILD_EXIT=$?"
echo "ALL_DONE"
