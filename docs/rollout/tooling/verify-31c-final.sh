#!/bin/bash
export DATABASE_URL=postgresql://postgres@localhost:5433/huchu_test
export DATABASE_URL_TEST=postgresql://postgres@localhost:5433/huchu_test
export NODE_OPTIONS=--max-old-space-size=7168
cd /home/user/huchu/apps/campus
echo "== campus typecheck (final)"; pnpm typecheck 2>&1 | grep -E "error TS" | head; echo "TC_EXIT=${PIPESTATUS[0]}"
echo "== campus lint (final)"; pnpm exec eslint . 2>&1 | grep -E "error|✖|problems|warning" | head -20; echo "LINT_EXIT=${PIPESTATUS[0]}"
echo "== campus tests (final)"; pnpm exec vitest run 2>&1 | grep -E "Test Files|Tests " ; echo "TEST_DONE"
cd /home/user/huchu/apps/legacy
echo "== legacy typecheck"; pnpm typecheck 2>&1 | grep -E "error TS" | head; echo "LEGACY_TC_EXIT=${PIPESTATUS[0]}"
echo "== legacy manifests + host tests"; pnpm exec vitest run lib/host/manifests.test.ts lib/host/workspace-feature-resolution.test.ts lib/host/records-search.test.ts 2>&1 | grep -E "Test Files|Tests |FAIL" ; echo "LEGACY_TEST_DONE"
echo "CHAIN_DONE"
