# Design skills bundle

A curated, vendored set of Claude Code **design** skills (UI/UX, animation,
3D/WebGL, component systems). They are installed into the global skills dir
(`~/.claude/skills`) on session start by `../hooks/session-start.sh`, so they
survive the ephemeral containers used by Claude Code on the web.

- The hook only runs in the web environment (`CLAUDE_CODE_REMOTE=true`); on a
  local machine it no-ops (install these once yourself instead).
- This directory is tooling only — it is not part of the application build.

Sources: freshtechbro/claudedesignskills, secondsky/claude-skills,
mattbx/shadcn-skills, ceorkm/mobile-app-ui-design (see each skill's own
SKILL.md / LICENSE).
