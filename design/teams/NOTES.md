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
