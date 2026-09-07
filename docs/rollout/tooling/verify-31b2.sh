#!/bin/bash
# 3.1b-2 verification: package typechecks and lint, boundary tests, package suites (DB, sequential), app typecheck, app tests, build.
export DATABASE_URL=postgresql://postgres@localhost:5433/huchu_test DATABASE_URL_TEST=postgresql://postgres@localhost:5433/huchu_test
MODS="platform modules/records modules/documents modules/notifications modules/books modules/people modules/stock modules/maintenance modules/compliance modules/gold modules/sell modules/crm modules/campus modules/offline"
for pkg in $MODS; do echo "== typecheck $pkg"; (cd /home/user/huchu/packages/$pkg && pnpm typecheck 2>&1 | grep -E "error TS" | head -25; echo "EXIT=${PIPESTATUS[0]}"); done
for pkg in $MODS; do echo "== lint $pkg"; (cd /home/user/huchu/packages/$pkg && pnpm lint 2>&1 | grep -E "^\s+[0-9]+:[0-9]+\s+error|✖" | head -12; echo "LINT_EXIT=${PIPESTATUS[0]}"); done
echo "== boundary tests"; for pkg in $MODS; do [ "$pkg" = platform ] && continue; (cd /home/user/huchu/packages/$pkg && pnpm exec vitest run module-boundary.test.ts 2>&1 | grep -E "Test Files|FAIL|×|Error" | head -6); done
echo "== package suites"; for pkg in $MODS; do [ "$pkg" = platform ] && continue; echo "-- $pkg"; (cd /home/user/huchu/packages/$pkg && pnpm exec vitest run 2>&1 | grep -E "Test Files|Tests |FAIL|×" | head -12); done
echo "== app typecheck"; (cd /home/user/huchu/apps/legacy && NODE_OPTIONS=--max-old-space-size=7168 pnpm typecheck 2>&1 | grep -E "error TS" | head -40; echo "TC_EXIT=${PIPESTATUS[0]}"; pnpm typecheck:scripts 2>&1 | grep -E "error TS" | head; echo "SCRIPTS_EXIT=${PIPESTATUS[0]}")
echo "== app lint (changed files)"; (cd /home/user/huchu/apps/legacy && git diff --name-only HEAD -- . | grep -E "\.(ts|tsx)$" | sed 's|^apps/legacy/||' | while read f; do [ -f "$f" ] && echo "$f"; done | xargs -r pnpm exec eslint 2>&1 | grep -E "^\s+[0-9]+:[0-9]+\s+error|✖" | head -20; echo "LINT_APP_DONE")
echo "== app tests"; (cd /home/user/huchu/apps/legacy && pnpm exec vitest run 2>&1 | grep -E "Test Files|Tests |FAIL|×" | head -20)
echo "== build"; (NODE_OPTIONS=--max-old-space-size=7168 pnpm build 2>&1 | grep -E "error|Error|Failed|BUILD" | head -20; echo "BUILD_EXIT=${PIPESTATUS[0]}")
echo CHAIN_DONE
