# Teams and the till: handover

Where the teams and till design stands on 20 Oct 2026, and the next steps in order. The design is on the Teams canvas, version 42. Every board is exported to `design/teams/boards/` (open `boards/index.html`). The briefs for building are `design/teams/BUILD.md` (teams) and `design/teams/BUILD-till.md` (the till). The prompts to paste into Claude Code are in `design/teams/KICKOFF.md`. Nothing of it is built yet.

## Where it stands

| Piece | Boards | State |
|---|---|---|
| Kit | K1–K9 (11) | Designed: presence and calls, people and seats, the timeline row bank by module and industry, the standard right panel (invoice, quote, builder, client), the top bar with Vane, missing states, motion |
| W1 A deal worked by the team | 7 | Designed. Record page in four states (open, call, email, after) |
| W2 Adding someone when every seat is taken | 8 | Designed |
| W3 Corelith signs up for Pabasa on a phone | 11 | Designed |
| W4 A member's access | 10 | Designed |
| W5 Vane learns the company in setup | 8 | Designed. PDF or photo in, kept facts with their page, Knowledge afterwards, Tender's price list to products |
| W6 Mufaro Hardware sets up Tender | 12 | Designed. W6-3b and W6-9 are the Counter Mini boards the till follows |
| W7 Across the workspace | 7 | Designed. Activity, notification settings, switcher, invite link |
| W8 The team on a deal, and the first quote | 11 | Designed |
| The gate: home, members, notifications | 8 | Designed. The owner called Home, Members and a member "spot on" (19 Oct) |
| Till: Tender on the Counter Mini | 47 | Designed (T1–T9, failures). The owner asked for this direction (20 Oct). Not yet reviewed by him |
| Record explorations A–D | 5 | Archive only; not exported. W1's record page replaces them |

The owner's corrections are in `design/teams/ledger.md`. Two of them override shipped work: the top bar (search, the bell and Vane as icon buttons with badges, actions folded into More) and the rule that the UI never explains itself.

## Next steps, in order

1. **Teams model.** Propose the migrations in `design/teams/model.md`, "What has to be built": memberships, invites, invite links, ownership offers, seats from memberships, overrides on the membership, `needsAction`, a team and follow on a record, per-record access, `source` and `module` on events, and `TENDER` and `PABASA` products. Each needs a yes.
2. **Teams kit and the top bar.** One change repairs every record page.
3. **LiveKit.** Server token minting and the room hook; calls behind a flag until the data-protection check (`design/teams/spec/open.md`).
4. **Teams workflows**: W1, W4, W2, W7, W8, W3, W5, W6, then the gate boards.
5. **Till**, as its own branch: the shell in the Counter Mini direction, then T1, T5, T3, T6, T7, T8, T4, T9 and failures. T2 waits for CUS-10.

Decisions still open, with the default to build meanwhile, are in `design/teams/spec/open.md`.

## Things to know

- **One world.** Every board is drawn from `design/teams/world.json`: Corelith (Sean the owner; Tatenda and Gerald admins; Munashe the manager; Simbarashe and Tariro field workers) and its nine open deals; Kuda Interiors; Mufaro Hardware (Nyasha the owner, Tendai the shop manager, Rumbidzai on Till 1, Blessing on stock). The till boards are Monday 19 October 2026, apart from T8 (Thursday 15 October). Fixture routes must keep these figures exact.
- **Images.** Staff photos and the Corelith mark are in `design/teams/boards/assets/img/`. The canvas source refers to them as `/_blob/<id>`; the exported pages use the files.
- **Regenerating.** `design/teams/tools/` holds the generators and the export scripts (`tools/export/pack_export.py`, `pack_screens.py`, `pack_shot.mjs`). Their paths point at the design session's folders; change `S` at the top of each before running.
- **Older till design.** `docs/design/till/` is the shipped till's design and build plan. The new till boards build on it; they don't replace its server work.
