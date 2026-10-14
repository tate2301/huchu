Paste this into Claude Code from the repo root:

---

Build Corelith's core modules from the design in `design/core-modules/`. Read `CLAUDE.md`, `AGENTS.md`, `docs/handover-core-modules.md`, `design/core-modules/spec/shell.md`, `design/core-modules/spec/vane.md` and `design/core-modules/app/ledger.md` first. The boards are in `design/core-modules/boards/` (open `design/core-modules/boards/index.html`); `design/core-modules/spec/boards.json` lists them with the notes beside them.

Already done and on `main`: Vane's connection to Claude (`lib/vane/claude.ts`) and Vane's tables, the made-by-Vane mark and the `vane_reader` roles (migration `20261012120000_vane`). Don't redo them.

1. Run the repo (handover §1), apply the migrations to the dev and test databases, and screenshot the pages in `design/core-modules/app/audit.md` at 1440 and 390 into `design/core-modules/before/`.
2. Wire the tokens into the theme, light and dark, and port the kit (`design/core-modules/html/kit.css`, `design/core-modules/boards/assets/core.css`) into the repo's components. Build a `/kit` route showing every component with its states.
3. Build the shell: rail, module panel, top bar with the Vane button and the notifications bell, Management behind the gear. Check the CRM deals page still works.
4. Add `/design/<slug>` fixture routes and run `design/core-modules/tests/visual.spec.ts` against localhost for the kit's 18 screens.
5. Build one module at a time, end to end with its states, from its boards: Management, Books, Reports & Insights, People and payroll, Notifications, Build, Branding, Explore. After each screen, run its tests and compare with its board; fix the differences before moving on.
6. Vane, in the order of handover §3: the reader connection and `run_sql`, the tools, the worker, then its screens and the pieces inside each module. Vane reads through its own login, never `SET ROLE` on the app's connection.
7. Wire every shortcut in `design/core-modules/spec/shortcuts.md`.
8. Write anything you couldn't match, and every placeholder from `design/core-modules/spec/open.md`, in `design/core-modules/NOTES.md`. Add the owner's corrections to `design/core-modules/app/ledger.md` in his words.

Propose any new table, column or role with its migration and wait for a yes. Commit after each screen passes. Don't push unless asked.
