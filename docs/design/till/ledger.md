# Ledger

Every correction, newest first.

| Date | Screen or component | Proposed | His words | Lesson |
|---|---|---|---|---|
| 5 Oct 2026 | Signing out, the preview host | "Someone else" in the person menu; the preview host as a bare developer form | "design the preview-host page for me … and then implement it, along with the logout flow" | Signing out is its own act: it asks once when a sale is on the till, holding it first, and "Who is selling?" says who left and what is still open. The preview host is drawn on the kit like any other screen |
| 5 Oct 2026 | Product tiles | Price, name and stock in text only | "products must show their previews too" | A tile carries its preview: the photo from `Product.imageUrl`, else a glyph for its kind on the fill |
| 5 Oct 2026 | Scope of the build | Liquor features as later work | "Liqour store also needs to be built" | The liquor store ships in the same slice as the general shop |
| 5 Oct 2026 | Scope of the build | Licence hours, open a case, receipt printing, discard a held sale listed as not in the code | "should be implemented in the same slice" | What a design shows is built with it, not parked |
| 5 Oct 2026 | The shell | A: the doors in the bar, a person menu | "B for the shell" | The cashier keeps an icon rail: seven doors in view, the person at the top, Lock at the foot |
| 5 Oct 2026 | Every till board | Rail, chips, card-like keys, stat rows on Shift, Reports and a sale, initials in circles, hand-drawn stroke icons, uppercase receipts | "design the screens" (the saas-design run, after "fix your designs. design all the flows please. read the code") | Build from the kit and the tokens, not from a one-off stylesheet. A till is a workbench: the scan field, the sale and one button that carries the amount |
| 5 Oct 2026 | Overlays on the canvas | Sheets and dialogs drawn over an imported screen | "fix your designs" | `dc-import` rendered blank on the canvas. Draw the screen under an overlay into the same board |
| 5 Oct 2026 | Payment | EcoCash push, ZWG at the counter, accounts, a scale | "read the code" | Design from the code: five tenders, references, split, manager by password. Invent only what is tagged new |
| 4 Oct 2026 | Pairing | Manager signs in on the device | "we can use the code-based flow" | The code is the manager's yes; nobody types a manager password on the shop floor to pair |

## Deliberate breaks

| Where | Rule broken | Reason |
|---|---|---|
| Every figure | One family for the interface | IBM Plex Mono for money, references and times: a second family with one fixed job, as the Corelith Workspace system sets it. Columns of figures line up and match the printed receipt |
| Receipt previews | No uppercase | None: the receipt is in sentence case too. Recorded because thermal receipts are usually all caps |
| Keypad keys and quick cash | Every action button carries an icon (B1) | A digit or an amount is its own glyph. The delete key carries the icon and an `aria-label`. Marked `data-lint-ignore="B1"` |
| Kit sheet | Loose buttons in a row (B2); danger on digits (C3) | A specimen sheet shows parts alone; the wrong pairing code is an error. Marked `data-lint-ignore` |

## Switches turned on in rules.json

| Switch | Reason |
|---|---|
| none | |

## Review notes

| Date | Check | Finding | Outcome |
|---|---|---|---|
| 5 Oct 2026 | saas-design lint, 62 screens at 1280, light and dark | 32 blocks first run: wrapping line names, › read as arrows, 700 weight, uppercase ZIMRA and a placeholder, states without screens | 0 block, 0 warn after the fixes |
| 5 Oct 2026 | Rams quick review | Change due not announced | `role="status" aria-live="polite"` on the tray's status line |
| 5 Oct 2026 | Rams quick review | Current line and wrong PIN by colour alone | Not changed: the line carries `aria-current`; the red dots sit under "Too many wrong PINs" |
| 5 Oct 2026 | Rams quick review, every till file | Layout written inline on the screens | Named classes in `till.css` (`with-rail`, `row.is-held`, `skeleton.is-lede` …); only bar heights and widths drawn from data stay inline |
| 5 Oct 2026 | Rams quick review | The pay tray a plain `div` with `role="dialog"`: no focus trap | The tray is a Radix dialog rendered in place, so it still rises over the sale column; Escape and the scrim do nothing once money is moving |
| 5 Oct 2026 | Rams quick review | Buttons that send a request stay pressable while it runs | Every one is disabled while pending: Take, Hold, Recall, Discard, Approve, Refund, Void, Move cash, Close shift, Unpair, Save my PIN, open a case, add a customer |
| 5 Oct 2026 | Rams quick review | Segmented choices as toggle groups, then as tabs without arrow keys | One `Segmented` part: a radio group, Tab lands on the chosen one, the arrows move it |
| 5 Oct 2026 | Browser check | Closing any till dialog left focus on the page body | Radix returns focus to a `Dialog.Trigger` only. The till root remembers what had focus outside a dialog and every dialog gives it back |
| 5 Oct 2026 | Rams quick review | "Use my password" on the lock did the same as "Someone else" | It signs out and opens "Who is selling?" on that person's password |

## Kit additions

| Part | Why | Where |
|---|---|---|
| `.keypad` | The kit lists a keypad in its inventory but ships no class. Amounts and PINs on a touch till need one: 56px keys, the figure it edits above it | `till.css` |
| `.tender` | The figure being entered on the payment tray: what was handed over, set large, with the change under it | `till.css` |
| `.pin` | Four PIN dots, hollow to filled; red only on a refusal | `till.css` |
| `.code-boxes` | Six boxes for a pairing code, grouped three and three | `till.css` |
| `.seg [aria-checked]` | The kit styles a chosen segment by `aria-pressed` or `aria-selected`; the till's segments are radios | `till.css` |
| `.visually-hidden` | A dialog's title when the screen already shows it, as on the pay tray | `till.css` |
| `.text-stack` | Two lines of text in one cell. Not `.col`: that is the kit's chart column | `till.css` |
