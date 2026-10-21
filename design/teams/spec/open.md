# Open decisions and what the boards invented

Build with the default until a decision is made. Record each decision here with the owner's words and the date.

## Teams

| Decision | Default until decided |
|---|---|
| Voice crossing the border: LiveKit Cloud's Africa location is in South Africa and falls back to the EU. Check against the Cyber and Data Protection Act before calls go live | Presence on; calls behind a flag, off in production |
| `FLARE` renamed in `WorkspaceProduct` when `PABASA` is added (`model.md`) | Add `PABASA` and `TENDER`; leave `FLARE` until the rename is approved with its migration |
| Billing | Out of scope. Seat limits link to the billing page already designed. The seat price on W2-3 (US$25.16) is fixture data |
| Custom roles | None this round: owner, admin, then job names per product |
| Export of members and records | Not in this version |
| The quote's route (W8-7) and the client's public quote link (W8-8) | Use the existing quote page; the public link is new and needs its route and access rule proposed |
| Where Knowledge lives (O6) | Management → Vane → Knowledge |
| Fitters' and field workers' reach in Vane (from the core modules handover) | Unchanged: field workers see only their own deals ("None yours yet") |

## Till

| Decision | Default until decided |
|---|---|
| On account at the till (T2). Needs CUS-10, an account balance ("Owes") and terms; the code has no credit limit, so none is drawn | Not built until approved |
| Refund limit that needs a manager | Shipped default US$20.00. The boards use US$2.00 for Mufaro so the dialog shows ("Refund over US$2.00") |
| Cash-drop limit | Shipped default US$500. The boards use US$400 |
| Offline window before selling stops | Shipped default 24 hours. The boards use 4 hours |
| Approval from the manager's phone (T3-4) and the Tender phone app's tabs (Today, Sales, Stock, Notifications, More) | Drawn, not specified elsewhere; propose the push and the app's frame before building |
| The PC till's address (`till.huchu.app` on T4 and T6) | Use the POS host's real address |
| History filters, the customer picker, and how a layby is opened | Drawn from the brief, not checked against `history.tsx`, `layby.tsx` and `person.tsx`. Check them first and note any difference in NOTES.md |

### New strings, not yet in the till lexicon

"Not an EcoCash reference", "No rate today", "Set today's rate", "Pay another way", "Send the receipt", "Charge to account", "Owes now", "Selling has stopped · Offline over 4 hours · 9 waiting to send", "Move cash to the safe", "Who's selling next?"

## Fixture facts the boards invented

These are fixture data, not product rules. Each is listed with its board in:

- `flows.md`, each workflow's steps;
- `flows-knowledge.md`, "End";
- `flows-till.md`, "Invented for T1", "Invented for T2–T5" and "Invented for T6 to failures".

Examples: S-10466 and its refund, LB-0012 Tsitsi Banda's layby, the Saturday cash-up out by US$4.00, Thursday's offline sales S-10152 to S-10160, the Kora's S-10491.
