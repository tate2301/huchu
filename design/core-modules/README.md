# Huchu core modules: handover

Everything from the Huchu Core Modules canvas (version 44) and the build so far, to carry on with Claude Code locally. 102 boards across 10 pages, the design kit they follow, the saas-design project files, and the next steps.

## Start here

1. Copy this folder into the repo as `design/` (or `design/core-modules/`). Copy `CLAUDE.md` to the repo root, or merge it into the one there (the repo's `AGENTS.md` still applies).
2. Copy `app/` to the repo root as `app/`, if the saas-design plugin is installed: its skills read the project from there.
3. Pull `main` (#208 and #210 are merged) and follow `docs/handover-core-modules.md` §1 to run it.
4. Open the repo in Claude Code and paste the prompt in `KICKOFF.md`.

To look at the boards, open `boards/index.html` in a browser: every page, the notes beside its boards, and each board on its own at its canvas size.

## What is inside

| Path | What it is |
|---|---|
| `KICKOFF.md` | The prompt for Claude Code: the build from here, in order |
| `CLAUDE.md` | The build brief and working rules |
| `docs/handover-core-modules.md` | Where the build stands and every next step (also on `main` in the repo) |
| `docs/vane.md` | Vane: its tables, what it may read, how it is set up (also on `main`) |
| `app/` | The saas-design project files: `brief.md`, `audit.md`, `world.json`, `tokens.json`, `rules.json`, `lexicon.json`, `ledger.md` (the owner's corrections) |
| `spec/boards.json` | Every board by page, with the notes written beside them: the design decisions and what the app has today |
| `spec/*.md`, `spec/*.json` | The design kit's spec: shell, Vane, Reports and Books, Management, shortcuts, decisions, tokens, the 18 kit screens; `open.md` updated to today |
| `boards/canvas/` | The canvas source: `canvas.json` and every `.dc.html` board, for re-importing into a canvas |
| `boards/view/` | Every board as a page that opens on its own (the Icon component is the one exception) |
| `boards/assets/` | `core.css` (tokens, kit, shell and page styles), Inter, the product marks |
| `html/`, `reference/` | The kit's 18 screens as HTML and as references at 1440, 390 and 1440 dark |
| `source/`, `tests/` | The kit's screen generators and its Playwright visual test |
| `tools/boards/` | The Python generators that wrote the boards (`ck.py` is the kit library; `port/` holds the report, Vane and plan pages) |

## Pages on the canvas

Vane · Explore · Reports & Insights · People and payroll · Notifications · Books · Build · Management · Branding · The kit
