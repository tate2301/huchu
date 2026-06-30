#!/bin/bash
# Installs the vendored "master designer" skill set into the user's global
# Claude skills dir (~/.claude/skills) on session start. Only runs in Claude
# Code on the web, where ~/.claude is ephemeral; locally these are installed
# permanently so it no-ops. Idempotent — safe to run on every session.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

ROOT="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"
SRC="$ROOT/.claude/design-skills"
DEST="$HOME/.claude/skills"

[ -d "$SRC" ] || exit 0
mkdir -p "$DEST"

count=0
for d in "$SRC"/*/; do
  [ -d "$d" ] || continue
  name="$(basename "$d")"
  [ -f "$d/SKILL.md" ] || continue
  rm -rf "$DEST/$name"
  cp -r "${d%/}" "$DEST/$name"
  count=$((count + 1))
done
echo "[session-start] installed $count design skills into $DEST" >&2
