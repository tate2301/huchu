# Workflows

Each starts with a person, a place and what they know, and ends with what is true on which records.
Times, codes and totals are from `world.json`. Board names are on the "Tender till" canvas.

## 1. Rudo sells to Rufaro and takes cash (most frequent)

- **Start**: Rudo, cashier, at Till 1, 08:14. Shift SH-00418 open. Rufaro Chipunza at the counter with seven things.
- **Steps**: scan or tap each product (`Sell`) · Add customer, find "0772 418" (`Customer`) · Cash is already chosen; Take US$21.68 (`Sell with Rufaro`) · the tray rises: US$25 handed over, change US$3.32 (`Pay cash`) · Take US$25.00 · the tray says paid in cash, change due, fiscalised, +21 points; Print receipt or skip (`Paid`) · Next sale (`Sell`).
- **End**: S-005080 paid; stock down; +21 points, 1,261 now; expected cash on SH-00418 up by US$21.68.
- **Failures**: a search with no match (`No match`); no connection at Take (`Saved on this till`).
- **Actions**: 7 taps or scans, 1 search, 3 presses to pay. Nothing asks twice.

## 2. Mai Tino comes back with her phone (hold, recall, mobile money)

- **Start**: 08:02, Mai Tino has no cash. Rudo holds her three things as "Mai Tino, fetching cash" (`Hold`), H-000031.
- **Steps**: Held (`Held sales`) · Recall the sale while another is on the till (`Put this sale aside first?`) · Mobile money; the reference is required (`Pay: a reference first`) · type MP2410030830 · Take US$6.40 (`Paid`).
- **End**: H-000031 recalled; S-005082 paid by mobile money with its reference.
- **Failures**: recall over a sale in progress asks once; discard a held sale is irreversible and asks (`Discard H-000032?`).

## 3. A dented bottle: a discount a manager approves

- **Start**: 08:21, a walk-in wants US$0.42 off a dented bottle of cooking oil.
- **Steps**: tap the line (`Change a line`) · discount US$0.42 · Charge says a manager approves (`Sell: to approve`) · Farai picks his name, types his password and the reason (`A manager approves`) · Approve and charge.
- **End**: S-005081 paid at US$4.78, override reason "Dented bottle (approved by Farai Mutasa)" on the sale and in Rudo's activity.
- **Failures**: wrong password (the field says so, nothing else moves); take the discount off instead.

## 4. Tapiwa brings back damaged rice (most at stake)

- **Start**: 08:40, Tapiwa Mhlanga with one bag of rice from S-005078, paid by mobile money.
- **Steps**: History (`History`) · S-005078 (`Sale`) · Refund lines: 1 of 2 rice, Damaged, back by mobile money with a reference (`Refund`) · Farai approves in the same window with his password · Refund US$2.80.
- **End**: R-000214 for US$2.80; S-005078 part refunded; rice back in stock; Tapiwa loses 3 points.
- **Failures**: a whole sale rung twice is voided instead (`Void S-005079?`), irreversible, with a manager.

## 5. A new device and a new cashier (crosses roles)

- **Start**: 07:52. Farai makes code 482 916 for Till 1 in the back office. A CounterMini is open at mbare.pos.corelith.co.zw.
- **Steps**: type the code (`Pair this device`) · a wrong digit first (`Code did not work`) · Who is selling? (`Who is selling?`) · Tendai has no PIN: his password once (`Your password, once`) · pick a PIN twice (`Pick a PIN`) · count the float, US$20.00 (`Open shift`) · the till (`Sell`).
- **End**: the device is Till 1; Tendai has a PIN; SH-00421 open.
- **Failures**: five wrong PINs (`Too many wrong PINs`); a device replaced later (`No longer a till`).

## 6. Rudo cashes up short, Farai takes the end-of-day report

- **Start**: 16:00, Rudo's shift SH-00418.
- **Steps**: Shift (`Shift`) · earlier, a drop to the safe of 2 × US$100 (`Move cash`) · Cash up: count by note, blind (`Count`) · check: expected US$254.15, counted US$247.00 (`Check`) · Close shift, short US$7.15 (`Closed`) · 18:04 Farai signs in and takes the report (`End of day`).
- **End**: SH-00418 closed short; Z-TILL1-20261003 frozen.

## 7. The line drops

- **Start**: 09:10, no connection.
- **Steps**: the till keeps selling with a banner (`Offline`) · each cash sale is saved here (`Saved on this till`) · Waiting to send lists them with what each needs (`Waiting to send`).

## Liquor store: Kuda at Avondale

- Deposits ride on returnable products; bottles back come off the sale (`Liquor: the sale`, `Bottles back`).
- The first 18+ product asks for ID once (`Check ID`). Johnnie Walker's discount stops at 5% (`Discount ceiling`).
- After 22:00 alcohol stops and the rest sells (`After 22:00`). Out of singles, open a case in place (`Open a case`).
- The receipt carries the licence and the 18 line (`Paid`).
