# Notes from the build

What the build did differently from the boards, and why. One heading per workflow or slice.

## Teams

## Till

Branch `claude/till-counter-mini`. The shell, sell, the tray, Paid and the Kora layout are built; the other doors follow.

### Different from the boards, on purpose

- **Font.** The boards are set in Inter, from the Teams canvas's kit. The till keeps Tender's own face, Atkinson Hyperlegible Next, which the owner chose for Tender.
- **The strip names the site, not the company.** The till's context carries the site and the till; "Harare Main Branch · Back till" on the seed, "Mufaro Hardware · Till 1" for a one-shop company. The mark is the receipt logo, else the site's first letter.
- **Kept although the boards leave them out**, because the shipped till does them: the quick-pick row above the groups, 18+ marks, stock left on tiles, bottles back (now a quiet key over hold and Take), discounts and gift vouchers under the summary, the drawer, lay-bys and Drop (now in the sale's More).
- **No Total row.** The amount rides on the Take key, as drawn. "Before discounts" and each saving still show once anything comes off.

### Behaviour that moved

- **How they pay is chosen in the tray**, as chips with Split, not in the sale column. Take opens the tray on the last way used; a chip starts the tray again on its way.
- **Hold is a key beside Take** and its popover opens upward from it. H still opens it.
- **The tray takes focus when it opens**, so Enter takes the money; before, focus went to the tray's first button. A field with autofocus (the EcoCash reference) still takes the keys first.
- **Paid has no "No receipt" button**: Next sale does the same.

### Words removed (the UI does not explain itself)

"Or tap anywhere else. The shelf works while this shows." · "Take is off until the reference is in." · "Change only comes from cash, so only cash can come to more than the total." · "The reference is on the message they get once it goes through." and the other EcoCash afterwords · the reference rule shown before Take is tried (it shows as an error once Take is pressed) · the long sentence after "No connection since …".

### Found while building

- `RetailTillRules` already has `refundPinOver`, `cashDropPromptOver` and `offlineHours`. Mufaro's US$2.00, US$400 and 4 hours are settings; no migration. `spec/open.md` listed them as new.
- `components/retail/till/till.css` on `main` held 49 lines written into the generated file by hand. They are now in `docs/design/till/till.css`, so the build makes them again. Each till screen has its own sheet in `docs/design/till/screens/`.

## Kit port: deviations from the boards (components/teams, /kit)

- Badges, primary buttons and "now" accents use the app's roles (neutral ink, action orange), not the boards' blue.
- Tender-framed boards (K2, K9, parts of K4b) are shown through the theme toggle in the kit, not per-frame: Tender is `:root`-scoped.
- Last-seat warning colour is added to the seat meter; the board does not draw it. Held seats are grey, not amber.
- K2 "Already a member" shows the whole invite form, not only the input.
- Module tiles use ink, with green (Pabasa) and orange (Tender), not per-module raw colours.
- K3b post box has no inner ring.
- K9 workspace marks use the action colour and the crown mark for both Pabasa and Tender; the Pabasa "K" mark is not drawn.
- The app shell caps content at 1344 px, so K6 wraps 3+1 and K7 is narrower than the board.
- Global classes `.select`, `.mention`, `.diff`, `.check` collide with docs/components.css: renamed `tm-sel`, `tm-mention`, `tm-diff`, `tm-check`.
- Raw hexes in boards replaced with role tokens.

## Agent B: W4, W2, W7 (people)

Built and checked in the browser: Members (`/preferences/organization/users`), a member's page, suspend (until a date, keep or hand over deals, seat freed, Undo with Ctrl Z), remove with hand-over, ownership offer dialog, invite drawer (Ctrl Enter) with the full-seats owner and admin paths, seat requests with Not now and Add the seat, `/join/[token]` for a workspace invite (six digits, then signed in and landed on the product home), `/join/[token]` for the shared link, and `/preferences/organization/invite-link`.

Not matched, and why:
- Members and the member page sit in the Settings surface (rail on the left), not the work shell the boards draw. The Settings surface has no command bar or Vane panel, so Search and Vane in the top bar are wired best-effort (Ctrl K event; Vane opens its management page).
- "Signed in on" (device and place) has no data. The member page shows "Last here" from the sign-in audit line.
- No gender on a person, so the Who changed what sentences use first names, not pronouns.
- "Give a discount" has no capability key, so the permission list has six rows, not seven.
- Admins can set permissions they do not hold: not enforced.
- Suspend until a date: the date is kept on the audit line and shown, but nothing restores the person when it passes.
- Accept-ownership "Needs you" row, the W4-F failure cells (only the owner can, last admin, offer lapsed, offline), W4-9 (Simbarashe's phone, Deals Mine/Everyone's: lives under `app/crm`, not mine) and the W2-F cells (declined card, already in another workspace) have no fixture routes yet.
- The seat price on the owner's button is the live `verticalRate`; Continue to billing and the card row are not built (billing is out of scope).
- Invite link: the address is stored as a hash, so it is shown once when made. "Expires", "Used" and Join by email domain have no model.
- W7-1/W7-2 Activity grouped by record, W7-3 personal quiet hours (quiet hours are a workspace policy today, `NotificationPolicy`), the workspace switcher component (blocked on M8) and the gate boards A4, A5, A6, P2, P3 are not built.
- A joined person lands on the product home (`/crm`), not on the deals list: the invite takes `landsOn` but the add-the-seat path does not set it.
