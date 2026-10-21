# Tender till: the selling portal on the Counter Mini

This follows the W6 Counter Mini direction: a dark bezel, a white screen, a slim header strip, big type, tray-coloured keys and one orange key. It is built on the shipped till (Shell B): the rail with seven doors, the shelf, the sale, the pay tray rising over the sale, Paid, Held and the customer display.

## T1: one sale, S-10485

Rumbidzai Moyo is on Till 1 at Mufaro Hardware on Monday 19 October 2026. Tendai typed in the ZiG rate, 26.90, at 07:52.

**Start.** Rumbidzai is signed in and Till 1 is open. Two sales are on hold, the latest at 10:05, and the till is empty.

**Steps** (8 actions):

| # | Time | Action | Board |
|---|---|---|---|
| 1 | 10:14 | Rumbidzai taps "PVA paint, white, 5 L" on the shelf. The tile gets a count badge, and the line appears in the sale and on the customer screen. | T1-1 |
| 2 | 10:14 | She taps "Paint brush 75 mm" twice. The badge reads 2 and the sale comes to US$34.80. | T1-1 |
| 3 | 10:15 | She presses Take US$34.80 (↵). The tray rises over the sale. | T1-2 |
| 4 | 10:15 | She chooses Split, puts US$30.00 on EcoCash and leaves the rest as cash. The customer screen shows merchant code 041288 and US$30.00. | T1-2, T1-5 |
| 5 | 10:15 | She types the reference from the customer's SMS, MP261019.1015.H48213, and presses Received US$30.00 (↵). The EcoCash part shows done. | T1-2 → T1-3 |
| 6 | 10:15 | She taps the US$5.00 note, or types 5 on the keypad. Change shows US$0.20, or ZiG 5.38 at the morning's rate. | T1-3 |
| 7 | 10:16 | She presses Finish US$34.80 (↵). Paid shows the change, the receipt prints, and the fiscal code is to follow. The customer screen says thank you and shows the change. | T1-4, T1-5 |
| 8 | 10:16 | She presses Next sale (N). The shelf is clear for the next customer. | — |

**End.** S-10485 is paid: US$30.00 by EcoCash and US$4.80 in cash (US$5.00 handed, US$0.20 change). The receipt is printed. The fiscal code will follow once ZIMRA device 21457 is back (it has been under checks since 14 October).

**Held: before and after S-10485.**

- At 10:05, Baba Tino's sale (US$110.00) is on the till. Rumbidzai presses Hold (H), types "Baba Tino, fetching cash" and presses Hold (↵). That takes 3 actions (T1-6a).
- At 10:17 the till is empty, so Recall does not ask. Rumbidzai opens Held, picks Baba Tino and presses Recall US$110.00 (R). That takes 2 actions (T1-6b).
- At 10:18 a hammer sale (US$7.90) is on the till. Recall asks once, "Hold the hammer sale first?", with Cancel or Hold it and recall (↵). That is 1 extra action (T1-6c).
- Discarding a held sale (the bin on its row) asks first. It is not drawn.

**Failures** (each has one way out):

| What goes wrong | What the till shows | The way out |
|---|---|---|
| The EcoCash reference is missing or mistyped | Received stays disabled, and the field outline turns `--bad` | Type the reference again |
| The customer's EcoCash didn't arrive | No push, so nothing comes in by itself. The part stays open. | Change the tender (chips) or ✕ back to the sale |
| Too little cash is handed | Change shows how much is still owed, in `--bad` | Type a larger amount or choose a note |
| The printer is out of paper or offline | The receipt fact reads "Not printed" | Print again (the printer key beside Next sale) |
| ZIMRA can't be reached | Fiscal code: "to follow" (this is a fact, not an error) | None needed. It is sent when the device returns. |
| The till goes offline mid-sale | The header wifi icon changes, and Paid reads "Waiting to send" | None needed. It sends by itself and the offline slip prints. |
| No ZiG rate set today | The ZiG change line is not shown. Only US$ change shows. | The manager sets the rate in Shift |

**Action count.** The sale takes 8 actions from the first tap to Next sale. Cash only would take 5 (two taps, Take, a note, Finish). Hold takes 3, and Recall takes 2, or 3 when a sale is on the till.

## Boards

| File | Size | Canvas title |
|---|---|---|
| T1-1-sell.dc.html | 1380 × 900 | T1 Sell |
| T1-2-pay-ecocash.dc.html | 1380 × 900 | T1 Pay · EcoCash |
| T1-3-pay-cash.dc.html | 1380 × 900 | T1 Pay · cash and change |
| T1-4-paid.dc.html | 1380 × 900 | T1 Paid |
| T1-5a-customer-scale.dc.html | 1380 × 900 | T1 Till and customer screen |
| T1-5b-customer-states.dc.html | 1380 × 900 | T1 Customer screen |
| T1-6a-hold.dc.html | 1380 × 900 | T1 Hold with a note |
| T1-6b-held-list.dc.html | 1380 × 900 | T1 Held |
| T1-6c-recall-ask.dc.html | 1380 × 900 | T1 Recall over a sale |

## Till shell

Each board links, in this order: `bundle.css`, `icons.css`, `icons-tl.css`, `icons-ob.css`, `icons-w6.css`, `icons-pos.css`, `teams.css`, `w6.css`, `pos.css`. The theme is `data-theme="tender"`. Every class starts with `pos-`, and the icons are `i i-pos-<phosphor name>` (89 fill or bold masks).

### Frame

```html
<div class="cx pos-board" data-theme="tender">        <!-- 1380 × 900 -->
  <div class="pos-dev">                                <!-- bezel 1324 × 844, radius 34, 22 px -->
    <div class="pos-scr">                              <!-- the Counter Mini screen, 1280 × 800 -->
      <div class="pos-bar">…</div>                     <!-- 52 px strip -->
      <div class="pos-body">rail · shelf · sale · [scrim + tray]</div>
      [pos-scrim pos-scrim--all + pos-sheet]           <!-- dialogs cover the strip too -->
```

- **`.pos-bar`** holds `.pos-mark` (the Mufaro mark, 28 px), `.pos-bar__shop`, `.pos-bar__till` "· Till 1", `.spacer`, the `i-pos-wifi-high` icon and `.pos-time` (mono).
- **`.pos-body`** is a grid: 84 px rail, 1fr shelf, 448 px sale.

### Rail

```html
<nav class="pos-rail">
  <img class="pos-rail__me" src="photo">
  <a class="pos-door" aria-current="page"><span class="i i-pos-cash-register"></span>Till</a>
  …Held (with .pos-door__n count) · History · Shift · Customers · Price check · Reports
  <a class="pos-door pos-rail__foot"><span class="i i-pos-lock-simple"></span>Lock</a>
</nav>
```

- Each door is 68 × 64 with a 24 px icon over a 12 px name.
- The current door fills with `--sel-fill`.

### Shelf

- **`.pos-shelf`** contains:
  - `.pos-find` (60 px tray field "Search or scan", with a 48 px `.pos-find__scan` camera key);
  - `.pos-cats` (44 px `.pos-cat` pills, `aria-pressed`);
  - `.pos-tiles` (4 columns).
- **`.pos-tile`** contains `.pos-tile__pic` (a photo, or a glyph for the kind of product on the tray), `.pos-tile__t`, `.pos-tile__p` (mono price) and `.pos-tile__n` (an orange count badge once the product is in the sale).

### Sale

```html
<section class="pos-sale">
  <div class="pos-sale__h"><span class="pos-sale__t">Sale</span> … .pos-icon (customer) .pos-icon (more)</div>
  <div class="pos-lines">
    <div class="pos-line [pos-line--on]">.pos-qty (− n +) · .pos-line__t/.pos-line__s · .pos-line__v</div>
    <div class="pos-line pos-line--ro">.pos-line__q "4 ×" …</div>   <!-- read-only preview -->
  </div>
  <div class="pos-sum"><div class="pos-sum__row">3 items · VAT US$4.67</div></div>
  <div class="pos-act"><span class="pos-hold">pause</span><span class="pos-take">Take <b>US$34.80</b><span class="kbd">↵</span></span></div>
</section>
```

- The `.pos-take` key is the one orange key on screen: 72 px tall, carrying the amount and its shortcut.
- `.pos-hold` is the 64 px quiet key beside it. It is also used for print again.
- `.pos-pill` is for a named customer.

### Pay tray

The tray rises over the sale column, and `.pos-scrim` dims the rail and the shelf.

```html
<div class="pos-scrim"></div>
<aside class="pos-tray">
  <div class="pos-tray__h [pos-tray__h--slim]">.pos-tray__k "Take" · .pos-tray__amt · ✕ .pos-icon</div>
  <div class="pos-tenders">5 × .pos-tender (Cash, Card, EcoCash, InnBucks, Split), aria-pressed</div>
  <div class="pos-parts [pos-parts--slim]">
    .pos-part (--now | --done | --wait): .pos-part__g · .pos-part__t/.pos-part__s · .pos-part__v
    .pos-field  (reference, mono, orange outline, .pos-caret)
  </div>
  .pos-tender-fig (Handed · big mono figure)
  .pos-notes (4 × .pos-note quick notes)   .pos-keys (3 × 4 .pos-key, 50 px; .pos-key--down)
  .pos-change (Change · or ZiG · rate fact · big US$ figure)
  <div class="pos-tray__foot pos-tray__foot--one"><span class="pos-take">…</span></div>
</aside>
```

### Paid, held and dialogs

- **Paid:** `.pos-paid` contains `.pos-paid__mark` (ok-soft tick), `.pos-paid__k` "Change", `.pos-paid__v` (72 px mono), `.pos-paid__z` "or ZiG …" and `.pos-facts` (rows of `.pos-fact`: icon · name · mono value). Next sale is the `.pos-take` key with N.
- **Held:** `.pos-h1` "Held" and `.pos-list` of `.pos-row` (`--on`). Each row has `.pos-row__g`, `.pos-row__t` (the note), `.pos-row__s` (lines · time), `.pos-row__v` and a bin `.pos-icon`.
- **Dialogs:** `.pos-scrim.pos-scrim--all` and `.pos-sheet` (520 px). The sheet holds `.pos-sheet__t`, an optional `.pos-input`, and `.pos-btns` with `.pos-btn` and `.pos-btn--go` (orange, with its kbd).
- **Receipt:** `.pos-receipt` is a slip with dashed rules, `.r` rows and `.c` centred lines. It is defined but not used on these boards.

### Customer screen

- `.pos-cdev` is a 384 × 764 phone bezel, and `.pos-cscr` is its 360 × 740 screen.
- The screen contains:
  - `.pos-cscr__top`: the mark and the shop name;
  - `.pos-clines`: a list of `.pos-cline` (qty · name · mono amount);
  - `.pos-ctotal`: Total;
  - `.pos-cpay`: the dark EcoCash merchant code block.
- `.pos-cboard` lays three phones side by side. `.pos-ccaption` names each state.

### Motion

- `posRise`: the tray, 300 ms.
- `posPop`: the sheet, the badge and the paid tick.
- `arrive`: lines.
- `posPrint`: the receipt.

All of these are off under `prefers-reduced-motion`.

## Invented for T1

- **Sale and payment:**
  - Till 1's ZiG rate is 26.90, set by Tendai at 07:52, so US$0.20 = ZiG 5.38.
  - VAT is 15.5%, included in the price (US$4.67 on S-10485).
  - The EcoCash reference is MP261019.1015.H48213, and S-10485 was paid at 10:16.
- **Shelf:** a paint roller 225 mm at US$6.50, so the shelf has 12 tiles. There are six shelf categories (All, Building, Paint, Plumbing, Tools, Fasteners).
- **Held sales:**
  - Baba Tino's held sale: 4 × cement, 6 × rebar Y12 and 2 kg of 75 mm nails, US$110.00 (VAT US$14.35).
  - A second held sale: "Tichaona, back after lunch", 09:40, US$46.00 (the wheelbarrow).
  - A hammer sale (US$7.90) is on the till at 10:18.
- **Labels:**
  - Received US$30.00 confirms a mobile-money part.
  - Finish US$34.80 completes the split.

## T2: a sale on account, S-10482

Same day and same till as T1: Till 1, Rumbidzai. Mavhima Construction (CU-0218) buys on account with 30-day terms.

**Code check.** The tender is "On account" (`ON_ACCOUNT`, the AddressBook icon; `lib/retail/payment-words.ts`). In the till it sits with bank transfer and voucher as the "other" tenders, which have no reference. The shipped till does not offer it yet: `tillTenders()` leaves it out, and the server refuses it with "Selling on account needs the customer's account, which the till cannot take yet." (CUS-10). These boards design CUS-10. The code has no credit limit, so none is drawn. The till does not hold an account balance either, so "Owes" is new.

**Start.** At 09:56 the sale is on the till as a walk-in: 20 × Cement 32.5R 50 kg (US$230.00), 10 × Rebar Y12 6 m (US$98.00), 2 t River sand (US$90.00) and 1 × Binding wire 25 kg (US$68.00). That is 33 items, US$486.00, VAT US$65.22.

| # | Time | Action | Board |
|---|---|---|---|
| 1 | 09:56 | Rumbidzai taps the customer key and types "Mavh". Mavhima Construction comes first, owing US$826.40. She presses Add Mavhima Construction (↵). | T2-1 |
| 2 | 09:57 | The sale shows the customer as a pill, with the account under it: On account, 30 days, owes US$826.40. She presses Take US$486.00 (↵). | T2-2 |
| 3 | 09:58 | In the tray she chooses On account, the sixth tender. The part shows US$826.40 → US$1,312.40. She presses Charge to account US$486.00 (↵). | T2-3 |
| 4 | 09:58 | The sale is charged to the account. The facts are S-10482, owes now US$1,312.40, receipt printed 09:58 and fiscal code to follow. She presses Next sale (N). | T2-4 |

The customer screen (T2-5) shows the lines, the total and an "On account · Mavhima Construction · CU-0218" block, then Thank you with US$486.00 on account. It does not show the balance owed.

**Failures** (each has one way out):

| What goes wrong | What the till shows | The way out |
|---|---|---|
| No customer on the sale | The On account tender is off until a customer is added | Add the customer |
| The customer has no account | The On account tender is off | Choose another tender |
| No connection | On account is off, because the server owns the balance (as the offline queue refuses it today) | Choose another tender, or wait for the connection |

**Actions:** 4, from the customer key to Next sale.

## T3: a refund that needs a manager, S-10466

The refund is done on Till 1 by Rumbidzai at 08:44–08:47, before T2. A customer bought four 20 mm elbows that should have been 25 mm.

**Code check.** History opens a sale's record. A refund takes lines and one reason from the shop's list, and the defaults are Damaged, Wrong item, Changed mind and Overcharged (`till-rules.ts`). When the rules hold a refund back, the server answers 409 `needsApprover`. The dialog then shows the reason, the people who may approve as chips, and four PIN dots over the keypad (`approval.tsx`). The rule's words are `refundPinSentence`: "Refunds over US$2.00 need a manager PIN."; the dialog title is the short form, "Refund over US$2.00". "Ask Tendai" on his phone is new. The PIN at the counter stays in the same dialog as the other way.

| # | Time | Action | Board |
|---|---|---|---|
| 1 | 08:44 | Rumbidzai opens History. S-10466 (08:21, cash, US$13.10) shows its lines and facts. She presses Refund. | T3-1 |
| 2 | 08:45 | She sets the 20 mm elbows to 4 (the other lines stay at 0) and picks Wrong item. The column reads cash back US$4.80, VAT US$0.64. She presses Refund US$4.80 (↵). | T3-2 |
| 3 | 08:45 | The rules ask for a manager. The dialog reads Refund over US$2.00, US$4.80, with Tendai (shop manager) and Nyasha (owner). Tendai is picked, and "Ask Tendai" has been sent: Asked Tendai, on his phone, 08:45. Tendai's PIN and the keypad stay live below. | T3-3 |
| 4 | 08:46 | On Tendai's phone, in Notifications, Needs you: Refund US$4.80, 4 × PVC elbow 20 mm, Wrong item, S-10466, back as cash. He presses Approve. | T3-4 |
| 5 | 08:46 | The till receives it: "Tendai approved, on his phone, 08:46". The PIN dims, and the dialog closes by itself. | T3-5 |
| 6 | 08:47 | The refund is done. It shows cash back US$4.80, approved by Tendai at 08:46, the drawer open at 08:47 and the refund slip printed. S-10466 is marked Part refunded in History. She presses Done (N). | T3-6 |

The PIN path replaces steps 3–5: Tendai is at the counter and types his four digits, and the fourth digit sends the refund. That is 1 action (the digits) instead of the phone.

**Failures** (each has one way out):

| What goes wrong | What the till shows | The way out |
|---|---|---|
| Tendai refuses on his phone | The ask row reads "Tendai refused" in `--bad` | Cancel |
| No answer from his phone | The ask row stays "Asked Tendai" | His PIN on the keypad |
| A wrong PIN | The dots shake and clear, and a "That PIN is not right." line appears (`WRONG_PIN`) | Type it again |
| A locked PIN | ADM-03's sentence (423) | Ask on the phone |

**Actions:** 5 at the till (History, the record, Refund, the lines and reason, Refund US$4.80) plus 1 on Tendai's phone.

## T4: a layby payment on Till 2, LB-0012

Till 2 is a Windows PC. The till is the same, running in a browser window that fills a 1440 × 900 screen: a tab, an address bar, then the same strip, rail, shelf and sale column. Tendai Chari is signed in, and his photo is on the rail.

**Code check.** Laybys go through `/api/v2/retail/laybys` on the till's PIN session. I could not read `layby.tsx` again because the linked computer dropped, so the way in is drawn as a search, not checked against the code.

| # | Time | Action | Board |
|---|---|---|---|
| 1 | 09:30 | Tendai types "Tsitsi" in Search or scan. The results show Laybys (LB-0012, Tsitsi Banda · Garden shed kit, left US$180.00, by 30 Nov) and Customers. He picks LB-0012. The column shows the shed kit at US$320.00, paid 28 Sep cash US$100.00 and 12 Oct EcoCash US$40.00, paid US$140.00, left US$180.00. He presses Take a payment (↵). | T4-1 |
| 2 | 09:31 | The tray asks for the amount (quick amounts 20.00, 50.00, 60.00 and 180.00, or typed on the PC keyboard). He picks 60.00 and EcoCash, merchant code 041288, and types reference MP261019.0931.K22719. It reads paid after this US$200.00, left US$120.00. He presses Received US$60.00 (↵). | T4-2 |
| 3 | 09:31 | The layby shows left to pay US$120.00 by 30 Nov, with a bar at 200 of 320. The facts are LB-0012, EcoCash US$60.00, paid so far US$200.00 and receipt printed 09:31. He presses Next sale (N). | T4-3 |

**Failures:** a payment over what is left is refused, and the amount shows in `--bad` with the most it can be (US$180.00). The EcoCash failures are the same as T1's.

**Actions:** 4 (search, pick, the amount and tender, Received).

## T5: History and a reprint

Till 1, Rumbidzai, 10:31–10:32. Her History since 07:58 has 10 sales, newest first:

| Sale | Time | First line or customer | Paid by | Total |
|---|---|---|---|---|
| S-10487 | 10:23 | Claw hammer 16 oz | Cash | US$7.90 |
| S-10486 | 10:21 | Baba Tino | Cash | US$110.00 |
| S-10485 | 10:16 | PVA paint, white, 5 L and 1 more | EcoCash and cash | US$34.80 |
| S-10482 | 09:58 | Mavhima Construction | On account | US$486.00 |
| S-10479 | 09:41 | Wheelbarrow 65 L and 1 more | Card | US$53.80 |
| S-10476 | 09:22 | PVC pipe 50 mm 6 m and 1 more | InnBucks | US$15.70 |
| S-10471 | 08:58 | Wire nails 75 mm, per kg | EcoCash | US$7.80 |
| S-10466 | 08:21 | PVC elbow 20 mm and 2 more (Part refunded) | Cash | US$13.10 |
| S-10462 | 08:09 | Paint roller 225 mm and 1 more | EcoCash | US$7.70 |
| S-10459 | 08:02 | Pillar tap 15 mm | Cash | US$8.50 |

| # | Time | Action | Board |
|---|---|---|---|
| 1 | 10:31 | Rumbidzai opens History, with All selected. S-10485's record shows EcoCash US$30.00, cash US$4.80 (US$5.00 handed), the receipt printed at 10:16 and the fiscal code to follow. | T5-1 |
| 2 | 10:31 | Mavhima's driver asks for a copy for their accounts office. She taps On account, which leaves 1 of 10 sales, and S-10482 opens. | T5-2 |
| 3 | 10:32 | She presses Print again (P). The copy prints with "Copy · printed 10:32" under the shop name, and the record's fact becomes "Printed again 10:32". | T5-3 |

A split sale appears under each of its tenders.

**Actions:** 3.

**The record's keys.** Print again is the primary (P), because it is the commonest act on a past sale. Refund is the quiet key beside it. Void and the rest are under ⋯.

## Boards, T2–T5

| File | Size | Canvas title |
|---|---|---|
| T2-1-customer.dc.html | 1380 × 900 | T2 Add the customer |
| T2-2-account-sale.dc.html | 1380 × 900 | T2 Sale on the account |
| T2-3-charge-account.dc.html | 1380 × 900 | T2 Charge to account |
| T2-4-charged.dc.html | 1380 × 900 | T2 Charged to the account |
| T2-5-customer-screen.dc.html | 1380 × 900 | T2 Customer screen |
| T3-1-history-record.dc.html | 1380 × 900 | T3 History · S-10466 |
| T3-2-refund-lines.dc.html | 1380 × 900 | T3 Refund lines and reason |
| T3-3-approval-asked.dc.html | 1380 × 900 | T3 Manager approval · asked |
| T3-4-tendai-phone.dc.html | 390 × 844 | T3 Tendai approves on his phone |
| T3-5-approved.dc.html | 1380 × 900 | T3 Approval arrives |
| T3-6-refunded.dc.html | 1380 × 900 | T3 Refunded |
| T4-1-layby.dc.html | 1440 × 900 | T4 Till 2 · layby LB-0012 |
| T4-2-layby-pay.dc.html | 1440 × 900 | T4 Layby payment by EcoCash |
| T4-3-layby-paid.dc.html | 1440 × 900 | T4 Layby paid |
| T5-1-history.dc.html | 1380 × 900 | T5 History |
| T5-2-history-account.dc.html | 1380 × 900 | T5 History · on account |
| T5-3-reprint.dc.html | 1380 × 900 | T5 Reprint a receipt |

These boards add `icons-posb.css` (`i i-posb-<name>`: address-book, barn, buildings, seal-check, user-check and the browser glyphs) and `pos-b.css` (`posb-`) after `pos.css`. The new pieces are:

- **`.posb-pc`:** the PC browser frame.
- **`.posb-acct`:** the account strip.
- **`.posb-crow`:** the customer picker row.
- **`.posb-tenders6`:** six tenders.
- **`.posb-owes`:** before → after.
- **`.posb-hrow` and `.posb-tag`:** the History row.
- **`.posb-recfacts` and `.posb-act2`:** the record's facts, plus Refund and Print again.
- **`.posb-rline`:** the refund line.
- **The approval:**
  - `.posb-appr` holds the dialog;
  - `.posb-who` is a person chip;
  - `.posb-ask` (with `--ok`) is the ask row;
  - `.posb-pin` and `.posb-dots` are the PIN.
- **`.posb-pask`:** the ask on the phone.
- **The layby:** `.posb-pays` is the payments, `.posb-left` is paid and left, and `.posb-bar` is the bar.

`pos-b.css` also sets `.pos-body` rows to `minmax(0, 1fr)`, so a long History list scrolls instead of pushing the keys off the screen. The generator is `scratchpad/pos/gen_b.py`, which reads gen.py's helpers without rewriting T1.

## Invented for T2–T5

- **T2:**
  - "On account" is offered at the till as a sixth tender. It needs a customer with an account.
  - The account shows "On account · 30 days · Owes".
  - The button is "Charge to account".
  - The receipt shows "Owes now".
  - Another customer appears in the search: Mavhunga, Farai, CU-0391, 0773 418 260.
  - The rebar is named "Rebar Y12 6 m", as on T1's shelf.
- **T3:**
  - Mufaro's refund limit is US$2.00 (the code's default is US$20.00).
  - S-10466 was sold at 08:21: 4 × PVC elbow 20 mm US$1.20, 1 × PVC pipe 20 mm 6 m US$4.90 and 1 × Solvent cement 100 ml US$3.40. That is US$13.10 (VAT US$1.76), paid in cash with US$15.00 handed.
  - Nyasha Mlambo (owner) is the second approver.
  - Tendai's phone app is Tender, with tabs Today, Sales, Stock, Notifications and More. The ask has Refuse and Approve buttons.
  - Rumbidzai opened Till 1 at 07:58 with a US$50.00 float.
  - The words "Asked Tendai", "Tendai approved", "Drawer open" and "Refund slip printed".
- **T4:**
  - The till's address is till.huchu.app.
  - Tsitsi Banda is CU-0307, 0772 905 113.
  - LB-0012 was taken on 28 Sep. The earlier payments were US$100.00 cash on 28 Sep and US$40.00 EcoCash on 12 Oct.
  - The reference is MP261019.0931.K22719.
  - The quick amounts are 20.00, 50.00, 60.00 and 180.00.
  - The way in is a search.
- **T5:**
  - S-10459, S-10462, S-10471, S-10476, S-10479, S-10486 and S-10487, with the times and totals in the table above.
  - The hammer sale was held at 10:18 and paid at 10:23. Baba Tino's sale was recalled and paid at 10:21.
  - The History filters are All, Cash, Card, EcoCash, InnBucks and On account.
  - The copy's header is "Copy · printed 10:32".
  - The driver asked for the copy.

## T6: the shift

Built on `shift.tsx`. The float and the cash-up are counted note by note (US$100 down to 10c, then ZiG where the shop takes it). The count is blind: the difference shows only once the server has it. A drawer out by more than US$1.00 asks what happened. When cash in the drawer passes the till rules' limit, the till asks once to move cash to the safe.

| # | When | Who, where | Action | Board |
|---|---|---|---|---|
| 1 | Mon 19 Oct 07:58 | Rumbidzai, Till 1 | She counts the float: 1 × US$20, 2 × US$10, 1 × US$5 and 5 × US$1. Then she presses Open the shift US$50.00 (↵). | T6-1 |
| 2 | 10:02 | Tendai, Till 2 (Windows PC) | The drawer holds about US$418.40, above the till rules' US$400.00. "Move cash to the safe" asks once, with Later or Move cash now (↵). | T6-2 |
| 3 | 10:03 | Tendai, Till 2 | Shift opens on Drop to the safe. He counts 3 × US$100 and presses Move US$300.00 (↵). | T6-3 |
| 4 | Sat 17 Oct 17:40 | Tendai, Till 2 | He counts the drawer blind: US$608.40 and ZiG 225.00, then Next: the float (↵). | T6-4 |
| 5 | 17:41 | Tendai, Till 2 | The difference appears: out by −US$4.00. He types what happened, leaves a float of US$50.00 and presses Close the shift (↵). | T6-5 |
| 6 | 17:42 | Tendai, Till 2 | The shift is closed: US$612.40 expected, US$4.00 short, and Nyasha signs it off. Then Who's selling next? (↵). | T6-6 |

**Actions.** Opening takes the notes (4 typed counts) and Open. The drop takes 3: Move cash now, the count, and Move. Cash-up takes one count per note held, then Next, What happened and Close.

## T7: lock and PIN

Built on `lock.tsx`, `gate.tsx` and `lib/retail/till-pin.ts`. The till locks with Lock, with L, or after 5 idle minutes. Five wrong PINs lock the PIN until a manager sends a new one; the password still opens the till. A PIN is sent on WhatsApp from Members, and the first time it is used it must be replaced.

| # | When | Action | Board |
|---|---|---|---|
| 1 | Mon 19 Oct 10:19 | Rumbidzai presses L. "Till 1 is locked" shows her name and shift. | T7-1 |
| 2 | 10:20 | Her fourth PIN is wrong: "That PIN is not right. 1 try left." | T7-1 |
| 3 | 10:20 | Her fifth is wrong: "Rumbidzai's PIN is locked" with "Too many tries. Ask a manager to send you a new PIN." The way out is Use my password (↵) or Someone else. | T7-2 |
| 4 | 10:20 | She types her password and presses Sign in (↵). | T7-3 |
| 5 | 10:21 | On her phone, Nyasha opens Members › Rumbidzai and presses Send a new PIN. It goes out on WhatsApp, and Till PIN reads "Sent on WhatsApp 10:21". | T7-4 |
| 6 | 12:58 | Back from lunch, Rumbidzai types the PIN she was sent. The till asks her to choose her own, New PIN and Again, then ✓. | T7-5 |

## T8: offline

Built on `sell.tsx` (banner), `shell.tsx` (the stop), `waiting.tsx`, `offline-slip.tsx` and `lib/retail/till-on-device.ts`. Cash sales keep selling and are saved on the till. Card, EcoCash and InnBucks still take their reference. Shifts, refunds, voids and cash moves need the line. Past the till rules' offline window, selling stops.

| # | When | Action | Board |
|---|---|---|---|
| 1 | Thu 15 Oct 11:06 | The line drops. The header wifi icon changes and the banner reads "No connection since 11:06". | T8-1 |
| 2 | 11:24 | Rumbidzai sells 2 × cement and 2 kg of nails, US$28.20, as usual. | T8-1 |
| 3 | 11:25 | Paid shows "Saved on this till · 7C2A91". The slip prints "Not yet a fiscal receipt", and the banner shows 1 waiting. | T8-2 |
| 4 | 11:52 | Waiting to send (from the banner) lists 3 sales, US$72.60, each "Saved on this till". | T8-3 |
| 5 | 15:07 | Four hours after the line dropped, the banner turns red: "Selling has stopped · Offline over 4 hours · 9 waiting to send" Take is off. | T8-4 |
| 6 | 15:22 | The line is back. All 9 sales go up on their own as S-10152 to S-10160 (US$315.00), and nothing is left waiting. | T8-5 |

## T9: the Kora in the yard

Tendai sells from Till 3, a Kora handheld (390 × 844), on Monday 19 October. Farai Chiweshe collects cement and sand. Everything is touch, so there are no key hints. The sale is a list with the total at the foot, and the pay screen keeps the till's five tenders.

| # | When | Action | Board |
|---|---|---|---|
| 1 | 11:05 | He scans a cement bag with the camera, then taps + up to 10. The sale is US$115.00. | T9-1 |
| 2 | 11:05 | He searches "sand" and taps River sand, per tonne. The sale is US$160.00. | T9-2 |
| 3 | 11:06 | He presses Take, chooses EcoCash and types the reference from the customer's SMS, MP261019.1106.K30772. Then Received US$160.00. | T9-3 |
| 4 | 11:07 | S-10491 is paid. He presses Send the receipt, which sends it on WhatsApp to the customer's number, then Next sale. | T9-4 |

**Actions.** 8 in all: scan, +, search, tap, Take, EcoCash, the reference with Received, and Send.

## Failures

T-F-failures. Each failure has one way out, and colour appears only on what went wrong.

| What goes wrong | What the till shows | The way out |
|---|---|---|
| A search matches nothing | The box shakes and its outline turns `--bad`, with "No product called "sement"" | Clear (Esc) |
| The EcoCash reference is in the wrong format | The field outline turns `--bad`, "Not an EcoCash reference" shows, and Received is off | Type it again in the field |
| The card is declined on the bank terminal | The card part reads Declined | Pay another way (↵) |
| No ZiG rate has been typed this morning | The ZiG choice is off and reads "No rate today" | Set today's rate (needs a manager) |
| The printer is out of paper | The Receipt fact reads "Out of paper" | Print again (P) |
| A product is out of stock | The tile is dimmed and reads "None left", so it can't be added | Adjust stock (long press, for someone who may) |
| The till is offline past the till rules' window | The red stop banner shows and Take is off | Connect the till (T8-4) |
| Five wrong PINs | "Rumbidzai's PIN is locked" | Use my password (T7-2) |

## Boards, T6 to failures

| File | Size | Canvas title |
|---|---|---|
| T6-1-open-float.dc.html | 1380 × 900 | T6 Open the shift · float |
| T6-2-drop-prompt-pc.dc.html | 1440 × 900 | T6 Till 2 · move cash to the safe |
| T6-3-drop-pc.dc.html | 1440 × 900 | T6 Till 2 · drop to the safe |
| T6-4-count-pc.dc.html | 1440 × 900 | T6 Till 2 · count the drawer |
| T6-5-out-by-pc.dc.html | 1440 × 900 | T6 Till 2 · out by US$4.00 |
| T6-6-closed-pc.dc.html | 1440 × 900 | T6 Till 2 · shift closed |
| T7-1-locked.dc.html | 1380 × 900 | T7 Till 1 locked |
| T7-2-pin-locked.dc.html | 1380 × 900 | T7 PIN locked |
| T7-3-password.dc.html | 1380 × 900 | T7 Sign in with a password |
| T7-4-send-pin.dc.html | 1380 × 900 | T7 Nyasha sends a new PIN |
| T7-5-own-pin.dc.html | 1380 × 900 | T7 Choose your own PIN |
| T8-1-offline-sell.dc.html | 1380 × 900 | T8 Selling with no connection |
| T8-2-saved-slip.dc.html | 1380 × 900 | T8 Saved on this till · slip |
| T8-3-waiting.dc.html | 1380 × 900 | T8 Waiting to send |
| T8-4-stop.dc.html | 1380 × 900 | T8 Selling has stopped |
| T8-5-sent.dc.html | 1380 × 900 | T8 Sent when the line came back |
| T9-1-kora-scan.dc.html | 480 × 960 | T9 Kora · scan |
| T9-2-kora-search.dc.html | 480 × 960 | T9 Kora · search |
| T9-3-kora-ecocash.dc.html | 480 × 960 | T9 Kora · EcoCash |
| T9-4-kora-receipt.dc.html | 480 × 960 | T9 Kora · receipt on WhatsApp |
| T-F-failures.dc.html | 1380 × 900 | T failures |

These are built from `scratchpad/pos/gen_c.py`. The styles are `pos-c.css` (classes `posc-`), plus `icons-posc.css` for the extra Phosphor glyphs: key, user-switch, wifi-slash, warning-circle, cloud-arrow-up, cloud-slash, sign-in, lock-key, password and eye-slash.

**New parts:**
- `posc-gate`: the lock, PIN-locked, password and choose-a-PIN screens, following W6-9 (who on the left, keys on a ground panel on the right).
- `posc-count`: one row per note.
- `posc-side`: the keypad panel.
- `posc-banner`: warn for offline, `--bad` for the stop.
- `posc-q`: the waiting rows.
- `posc-mon` / `posc-win`: the PC with its browser.
- `posc-kdev`: the Kora.
- `posc-pdev`: Nyasha's phone.

## Invented for T6 to failures

- **Till rules:**
  - Mufaro's cash-drop limit is US$400.00 (the shipped default is US$500.00).
  - The offline window is 4 hours (the shipped default is 24).
- **Shift numbers:** SH-0007 (Till 2, Sat 17 Oct), SH-0009 (Till 2, Mon) and SH-0010 (Till 1, Mon).
- **Till 2, Monday:**
  - 12 sales, all cash, US$368.40 by 10:03.
  - Cash in the drawer was about US$418.40 at 10:02, with US$300.00 dropped.
- **Saturday cash-up (Till 2):**
  - 41 sales, US$1,286.70.
  - Counted by note: 2 × 100, 4 × 50, 8 × 20, 3 × 10, 2 × 5, 7 × 1, 2 × 50c and 4 × 10c.
  - ZiG 225.00 counted.
  - The note reads "Gave US$5 change instead of US$1 on a cement sale".
  - A float of US$50.00 is left.
- **Rumbidzai:**
  - Her WhatsApp number is +263 77 318 4402.
  - The new PIN was sent at 10:21, and she first used it at 12:58.
- **Thursday 15 October offline:**
  - The line was down from 11:06 to 15:22.
  - There were nine sales, tags 7C2A91 to E28F14, US$315.00. One was by card (US$39.20) and one by EcoCash (Mai Rudo, US$21.60).
  - They became S-10152 to S-10160.
  - The slip header reads "Mufaro Hardware, Chitungwiza".
- **The Kora:**
  - Till 3 is a Kora used in the yard.
  - S-10491 at 11:07 was 10 × cement and 1 t of river sand, US$160.00 (VAT US$21.47).
  - The EcoCash reference was MP261019.1106.K30772.
  - The customer is Farai Chiweshe, +263 77 412 6630.
  - 31 tonnes of sand are left.
- **Copy:**
  - "Not an EcoCash reference", "No rate today", "Set today's rate", "Pay another way" and "Send the receipt" are new strings, not in the shipped lexicon.
  - Rows and facts state facts. The shipped help lines are left out (for example "In US$ notes, left in the drawer…" and the offline banner's second sentence).

