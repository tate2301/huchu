# Till: build brief

You are restyling and extending Tender's till, the selling portal on the POS host, in the Counter Mini direction the owner chose ("I want you to explore this direction but for the actual POS portal… I love its direction"). The reference for the direction is the Counter Mini boards W6-3b (pair this till) and W6-9 ("Who's selling?" with the PIN keypad). The design is the `till` page of the Teams canvas, version 42: 47 boards, T1 to T9 and the failures board. Every board is in `design/teams/boards/` with `T` ids. Make the till match it on the Counter Mini (1280 × 800), on a PC browser (Till 2) and on the Kora (390 wide). Don't redesign, reword or add features. If something looks wrong, write it in `design/teams/NOTES.md` and build it as drawn.

This builds on the shipped till, not beside it: Shell B (the icon rail), the workflows and the server in `docs/design/till/build-plan.md`, and the components in `components/retail/till/`. Most of the boards restyle what is already there. What is new is listed under "New behaviour".

## What to read

| Path | What it is |
|---|---|
| `boards/index.html`, section "Till · Tender on the Counter Mini" | Every till board with its route |
| `boards/view/T*.html`, `boards/png/T*.png` | The markup and what done looks like |
| `boards/assets/pos.css`, `pos-b.css`, `pos-c.css`, `icons-pos*.css` | The till shell and its parts. Every class starts `pos-`, `posb-` or `posc-`; icons are `i i-pos-<phosphor name>` |
| `flows-till.md` | T1 to T9 step by step with times, actions counted, failures, the till shell's anatomy ("Till shell") and what each part invented ("Invented for …") |
| `world.json`, the `mock` section | Mufaro Hardware: tills, staff, products, prices, the day's sales |
| `spec/open.md`, "Till" | Decisions to make before some steps |
| `docs/design/till/` | The shipped till's brief, flows, lexicon, ledger and build plan |

## The shell

From `flows-till.md`, "Till shell". The Counter Mini screen is 1280 × 800:

- a 52 px strip with the shop's mark, the shop name, "· Till 1", the connection icon and the time;
- the 84 px rail: the person's photo at the top, seven doors (Till, Held, History, Shift, Customers, Price check, Reports) and Lock at the foot;
- the shelf: search or scan, category pills, a four-column grid of tiles with count badges;
- the 448 px sale column, ending in the hold key and the one orange key, which carries the amount and its shortcut;
- the pay tray, which rises over the sale and dims the rest.

Dialogs cover the strip too. Figures are IBM Plex Mono. The theme is `data-theme="tender"`. Motion: the tray rises in 300 ms; the sheet, badges and the paid tick pop. All motion is off under reduced motion.

## Order of work

1. **Shell and kit.** Port `pos.css` into the till's components: frame, strip, rail, shelf, tile, line, sum, the hold and Take keys, the tray, tenders, parts, the reference field, quick notes, the keypad, change, Paid, the list row, the sheet and the customer screen. Change the components, not their uses.
2. **T1, one sale**: sell, pay by EcoCash then cash with change in ZiG, Paid, the customer screen in its three states, hold with a note, Held, and recall over a sale.
3. **T5, History and reprint**, with the filters (All, Cash, Card, EcoCash, InnBucks, On account).
4. **T3, a refund over the limit.** Manager approval with both ways in: the manager's chip and PIN on the till, or approval from his phone (T3-4), with the PIN dimming when the phone approves.
5. **T6, the shift**: count the float by note, the cash-to-the-safe prompt over the limit, the drop, the blind count note by note in US$ and ZiG, "Out by", what happened, close, and "Who's selling next?"
6. **T7, lock and PIN**: locked, a wrong PIN, PIN locked, sign in with the password, the owner sends a new PIN from her phone (WhatsApp), choose your own PIN.
7. **T8, offline**: the banner, the saved slip, Waiting to send, selling stops after the till rules' window, and sent when the line comes back with the real sale numbers.
8. **T4, Till 2 on a PC**: the same till in a browser window, with a keyboard. The tray shows quick amounts and no keypad.
9. **T9, the Kora**: the same till at 390 wide, touch only, no shortcut hints. Scan, search, EcoCash, and send the receipt on WhatsApp.
10. **T2, on account**, once CUS-10 is approved (`spec/open.md`).
11. **Failures** (T-F): no match, an EcoCash reference in the wrong format, card declined, no ZiG rate today, printer out of paper, out of stock.

## New behaviour (propose each with its migration before building)

- **On account as a tender** (T2), with the customer's account strip (terms, Owes) and "Owes now" on the receipt. The server refuses it at the till today ("…which the till cannot take yet", CUS-10).
- **Approval from the manager's phone** (T3-3 to T3-5): the request goes to his Needs you; Approve on the phone completes the dialog on the till.
- **Till rules**: the refund limit that needs a manager, the cash-drop limit and the offline window are settings per shop, read by the till. The boards use Mufaro's values, not the shipped defaults (`spec/open.md`).
- **Selling stops** when a till has been offline longer than the window (T8-4). Take is off until it reconnects and sends what it holds.
- **Send the receipt on WhatsApp** from Paid (T9-4).

## Fixture routes

Development-only `/design/<id>` routes on the POS host render each board with Mufaro Hardware's data on Monday 19 October 2026 (T8 is Thursday 15 October). S-10485 is US$34.80 (PVA paint US$30.00 and 2 brushes at US$2.40), paid US$30.00 by EcoCash and US$4.80 in cash. Cement 32.5R is US$11.50. VAT is 15.5%. Every figure in `flows-till.md` adds up; keep it exact.

## Acceptance

- Each till board matches at its size: 1380 × 900 boards hold the 1280 × 800 screen inside the bezel; PC boards are 1440 × 900; Kora boards are 480 × 960 with a 390-wide screen.
- `pnpm typecheck`, `npx eslint` on changed files, the till's tests, and every till screen looked at on the POS host.
- The e2e specs that drive the old till (`e2e/pos-portal-suite.spec.ts`, `e2e/retail-*.spec.ts`) are rewritten with these flows, not patched.
- Strings come from the shipped till lexicon (`docs/design/till/lexicon.json`). New strings are listed in `spec/open.md`; add them to the lexicon as you build.
