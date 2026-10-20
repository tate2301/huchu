Two slices, each its own branch and PR. Paste one into Claude Code from the repo root.

## Teams

---

Build Corelith's teams work from the design in `design/teams/`. Read `AGENTS.md`, `docs/handover-teams.md`, `design/teams/BUILD.md`, `design/teams/model.md`, `design/teams/ledger.md` and `design/teams/spec/open.md` first. The boards are in `design/teams/boards/` (open `boards/index.html`); `spec/screens.json` lists every board with its route.

1. Run the repo and screenshot today's pages listed in BUILD.md ("Before the first edit") at 1440 and 390 into `design/teams/before/`.
2. Propose the model from `model.md` ("What has to be built") as migrations with witness tests, and wait for a yes before applying any of it.
3. Port the kit: the top bar with icon tools and badges, the standard right panel, the timeline row bank, presence and the call bar, member rows and the seat meter, the panel's states and motion. Build `/kit` to match K1 to K9.
4. LiveKit: token minting on the server, then the room hook. Calls stay behind a flag (`spec/open.md`).
5. Build the workflows one at a time, in BUILD.md's order, each end to end with its failure board. After each screen, compare it with its board at its size and at 390; fix the differences before moving on.
6. Wire every shortcut the boards show and add it to the shortcut test.
7. Write anything you couldn't match in `design/teams/NOTES.md`. Add the owner's corrections to `design/teams/ledger.md` in his words.

Propose any new table, column or role with its migration and wait for a yes. Commit after each screen passes. Don't push unless asked.

---

## Till

---

Restyle and extend Tender's till from the design in `design/teams/`. Read `AGENTS.md`, `docs/handover-teams.md`, `design/teams/BUILD-till.md`, `design/teams/flows-till.md` ("Till shell" first), `docs/design/till/build-plan.md` and `design/teams/spec/open.md` ("Till") first. The till boards are the `T` ids in `design/teams/boards/` (open `boards/index.html`, section "Till · Tender on the Counter Mini").

1. Run the POS host and screenshot the till's Sell, Pay, Paid, Held, History, Shift, Lock and offline screens at 1280 × 800 into `design/teams/before/till/`.
2. Check `history.tsx`, `layby.tsx` and `person.tsx` against T4, T5 and T2-1. Note each difference in `design/teams/NOTES.md`.
3. Port `boards/assets/pos.css` into the till's components; then `pos-b.css` and `pos-c.css` where T2 to T9 use them.
4. Build T1, T5, T3, T6, T7, T8, T4, T9 and the failures board in that order, each end to end. Compare each screen with its board; fix the differences before moving on.
5. Propose each item under "New behaviour" in BUILD-till.md, with its migration, and wait for a yes. T2 (on account) waits for CUS-10.
6. Add new strings to `docs/design/till/lexicon.json`. Rewrite the old till e2e specs with these flows.

Commit after each screen passes. Don't push unless asked.

---
