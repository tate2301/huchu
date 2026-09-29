# Retail, drawn to the management direction

**Date:** 2026-09-29 · **Base:** `main` @ `bf10edb` · **Tenant photographed:** `acme`
(`scripts/seed-retail-demo.ts --days 180`)

The management surface was rebuilt in `7cc7f1c` to one contract, and the CRM's
money pages were redrawn to it in `808df24` and `ba38e6d`. Retail — the back
office, the stock screens it borrows from Stores, the till, and the ZIMRA
fiscalisation it depends on — was not. This plan says what the direction is,
catalogues every retail workflow end to end from signing in to fiscalising, and
lists the work that makes retail read like management.

Screenshots of the state this plan was written against are in
`docs/retail/screenshots/alignment/before-*.png`. The after set is produced by
`e2e/retail-journeys.spec.ts`, which also walks every workflow in §2.

---

## 1. The direction

The contract is written in the commit message of `7cc7f1c` and restated for the
money pages in `docs/crm/projects-and-money.md` ("How the pages are drawn"). Its
parts, in the order retail breaks them:

| # | Rule | Where retail breaks it today |
|---|---|---|
| D1 | **Writing is the design.** No lede under a page's name, no helper line under a field, no paragraph over a table. A control that needs explaining is misnamed. | Every setup page carries a card subtitle ("Protect the takings without making every tender feel like a compliance exercise"); every tile has a footer sentence; the product dialog has a description. |
| D2 | **A page names itself once**, in the app bar. | The sidebar lists Products, Prices, Promotions; a tab rail under the bar lists them again as Catalog, Pricing, Promotions. The Insights group lists Reports twice. |
| D3 | **No summary band on a working page.** Totals belong on an overview. | 24 bands of StatCard tiles, 17 of them over the table they do not govern (see the forms inventory). |
| D4 | **Forms open in a dialog** — one dialog per verb, header and footer pinned, errors above the fields (`RecordDialog`). | Prices are typed into table cells with a Save per row; a stock count and a transfer are cards above their tables; till rules, till provisioning and the accounting seed pack are cards on the page; stock items and locations open in side sheets; a product's stock item opens a second dialog on top of the first. |
| D5 | **A verb sits beside the thing it acts on** — the page's one verb in the bar, a section's verb on its heading, a row's verb as an icon. | App bars carry three outline buttons that are navigation (Catalog, Promotions, Reports), not verbs. |
| D6 | **A badge marks an exception.** Healthy states draw nothing in a header and a dot and a word in a list. | `ACTIVE` in capitals on every product row and every price row. |
| D7 | **Every list names its columns once**, in sentence case; figures mono and right-aligned; one type scale. | `ITEM`, `SKU`, `SELL PRICE`, `TAX %` in capitals; `14.00 bottle` as the stock figure; `9/29/2026` as a date. |
| D8 | **Settings live in the settings surface.** | Retail's five setup screens are pages in the working sidebar, filed under Insights, with charts of a policy's checkboxes. |
| D9 | **Dates are written one way**, day first: "29 Sept 2026". A negative takes a true minus. | US month-first dates on receipts and orders; `$82.81` variance with no sign. |
| D10 | **Failures say what did not happen**; load errors and save errors are different sentences; destroying anything confirms and says what happens. | "Unable to …", "Create failed", "Error". |

---

## 2. The workflows

Every workflow a shop runs, who runs it, where it starts and what it touches.
**Before** is what happened when it was walked on `acme` on 2026-09-29, before
any change here; **After** is what this change leaves. W3–W14 and W16–W17 are
`test()`s in `e2e/retail-journeys.spec.ts`; W15 and W18–W21 are the trading day
in `e2e/retail-workflows.spec.ts` and `retail-void.spec.ts`.

| ID | Workflow | Who | Starts at | Forms | Before | After |
|---|---|---|---|---|---|---|
| W1 | Sign in to the back office | owner, manager | `/login` | sign-in | works | unchanged |
| W2 | Sign in to the till | cashier | the till's host, `/login` | sign-in, till PIN | works — through the workspace's own sign-in form, not the till's (see §6) | unchanged |
| W3 | Add a product | manager | Products | New product | **two dialogs**: a product needed a stock item first, made in a dialog on top of the product's, under mining categories (Spares, PPE, Reagents) | one dialog; the API makes the stock line |
| W4 | Edit a product, take it off sale | manager | Products → row menu | Edit product | **broke**: the dialog offered Discontinued, which the API refuses | On sale is a checkbox; the API's two states only |
| W5 | Change a price | manager | Prices → row menu | Change price | inputs in table cells, a Save on every row | a dialog; the list only reads |
| W6 | Run a promotion | manager | Promotions | New promotion | worked; toasts said "Created" | named toasts; no "Advanced options" |
| W7 | Order stock, receive the delivery | stock clerk | Orders → row menu → Deliveries | New order, Receive a delivery | worked; "Receipts" collided with the customer's receipt | Deliveries |
| W8 | Count stock | stock clerk | Stock counts | Count stock | a card above a table of products | a dialog; the table is the counts' history |
| W9 | Move stock between locations | stock clerk | Transfers | Move stock | a card above the table; the "from" column was wrong after any move | a dialog; "To" |
| W10 | Add a stock location | manager | Locations | New location | a side sheet | a dialog |
| W11 | Add a till | owner | Settings → Shop → Tills | New till | a provisioning card on a page of charts under Insights, and a new till always became the default | the settings register; Make default is its own verb |
| W12 | Set the till rules | owner | Settings → Shop → Till rules | Till rules | a card beside two charts of its own checkboxes | a settings form |
| W13 | Set up the accounts a sale posts to | owner | Settings → Shop → Posting | Set up the accounts | a card with a paragraph and a seed-pack form | checks and tenders as facts; the seed pack in a dialog |
| W14 | Set up and register the fiscal device, open the day | owner | Settings → Shop → Fiscal device | Fiscal device, Register with ZIMRA | **could not be done**: twenty fields on the accounting page, **no way to register a device** (`registerDevice` was never called), and **no way to give a tax code its ZIMRA taxID**, so no tax line could be signed | one form; Register with ZIMRA, which also matches the shop's tax codes to the device's taxes by rate; Open the fiscal day |
| W15 | Open a shift | cashier | Till → Shift | Open shift | works | words only |
| W16 | Sell on the till | cashier | Till | Charge | works | words only |
| W17 | Fiscalise a sale | automatic | a posted sale | — | **broke twice**: an online sale was never fiscalised (only the offline queue drained), and the retail settings rows in the provider table made every shop look like it had a device, so a sale would have been sent to be signed by a row with no key | fiscalised on posting; the till says "Fiscalised" and the number; the sale record says it too |
| W18 | Refund or void a sale | cashier + manager | Till → History | Refund, Void | works | reversals are still not fiscalised online (see §6) |
| W19 | Move cash in or out of the drawer | cashier | Till → Shift | Move cash | works | words only |
| W20 | Close a shift and cash up | cashier, manager | Till → Shift; Shifts | Close shift | works | the back office's close is a row verb |
| W21 | Take the end-of-day report | manager | Till → Reports | Take the report | works | words only |
| W22 | Read the day in the back office | manager | Overview, Sales, Shifts, Insights | — | every page opened on tiles | tiles on the overview and Insights only |
| W23 | Add a customer | cashier | Till | Attach customer | works | words only |
| W24 | Invite a user | owner | Settings → Users | New user | a side sheet | a dialog (every management create form is) |

---

## 3. Names

One word per thing, the shop's word, used in the sidebar, the bar, the
buttons, the dialogs, the toasts and the column headers alike. Where the
management surface already names the thing, its name wins.

| Thing | Name | Not |
|---|---|---|
| What the shop sells | **Product** | item, catalog item, catalogue line, sellable line |
| The list of them | **Products** | Catalog, Catalogue, Range |
| What a product sells for | **Price** | sell price, shelf price, unit price |
| The previous price shown struck through | **Was** | compare at, compare-at price |
| The tax on a line | **VAT** | tax %, tax percent, tax rate |
| The list of prices | **Prices** | Pricing, live shelf pricing |
| How many are in the shop | **On hand** | stock, current stock, qty |
| Counting what is on the shelf | **Stock count** | count, counts, count a line, stock take |
| Goods arriving from a supplier | **Delivery** | receipt, goods receipt, GRN (the number keeps its `GRN-` prefix) |
| What the shop asks a supplier for | **Order** | purchase order, PO |
| What the customer takes home | **Receipt** | slip |
| The machine a cashier sells from | **Till** | register, terminal, POS |
| The place the shop trades from | **Site** | branch, store, shop (management's word) |
| A cashier's session at a till | **Shift** | session |
| Counting the drawer at the end | **Cash up** | cash-up, closeout |
| The machine that signs receipts for ZIMRA | **Fiscal device** | provider, provider config |
| A sale ZIMRA has accepted | **Fiscalised** | signed, SUCCESS |
| The day on a fiscal device | **Fiscal day** | Fiscal Day |
| The rules a till follows | **Till rules** | POS policy, checkout policy |
| Where money is posted | **Posting** | accounting setup, tender account mappings |

---

## 4. Writing

The same sentences in the same places, on both sides.

| Moment | Pattern | Example |
|---|---|---|
| The verb that creates | New + noun | New product |
| The dialog it opens | New + noun | New product |
| Its submit | Create + noun | Create product |
| An edit dialog | the record's name | Castle Lager 340ml |
| Its submit | Save + noun | Save product |
| One-field change | the verb | Change price → Save price |
| Success | Noun + past participle | Product created · Price saved |
| A save that failed | That + noun + was not + participle | That product was not created |
| A load that failed | Noun + would not load | The products would not load |
| Empty, nothing yet | No + plural + yet | No products yet |
| Empty, a search | No + plural + match that search | No products match that search |
| Destroy | Verb + the + noun, and what happens | Take Castle Lager off sale? It stops appearing on the till. On hand is kept. |
| A column | the noun, sentence case | Product · On hand · Price · VAT |
| A healthy state | nothing | (no Active chip) |
| An exception | one word | Off sale · Low · Short · Over · Not fiscalised |

---

## 5. The work

Every item below is done in this change unless it says otherwise.

### Phase A — every workflow completes

1. **W17** Fiscalise an online sale once it commits (`fiscaliseAfterPosting`
   in `lib/retail/fiscalisation.ts`) and carry the outcome to the till's
   sale-complete dialog and the sale record. Refunds and voids: see §6.
2. **W17** Keep retail's settings rows out of every fiscal device lookup
   (`lib/accounting/fiscal-device-scope.ts`).
3. **W14** Register a fiscal device: `POST
   /api/accounting/fiscalisation/device/register` makes the keypair and the
   certificate request, calls `registerDevice`, and stores the certificate and
   key in the bundle the signer reads. It then reads the device's
   configuration and gives each sales tax code the ZIMRA taxID that charges
   its rate (`lib/accounting/zimra-tax-mapping.ts`) — 0% is left alone when
   ZIMRA also lists an exempt tax, because the rate cannot say which it is.
   `scripts/fake-fdms.mjs` stands in for FDMS in the suite.
4. **W3** One New product dialog. The API makes the product's stock line when
   none is given, at the shop's site, in its first location.
5. **W4** On sale / off sale — the two states the API accepts.

### Phase B — one surface

6. **D8** A **Shop** group in the settings rail, in the slot Operations and
   School hold: Tills, Till rules, Posting, Fiscal device. The routes stay at
   `/retail/setup/**` and draw themselves in the surface; the rail's amber dot
   replaces the old setup checklist. `/retail/setup` and `/retail/setup/branding`
   redirect (receipt branding is Settings → Branding).
7. **D2** `RetailShell` draws no tab rail (`lib/retail/areas.ts` is deleted);
   the sidebar is the one list of siblings. Insights no longer lists Reports
   twice, nor the setup pages.
8. **D3** Tiles leave every working page. The overview and Insights keep
   theirs; so do the till's Today screen and its end-of-day report.
9. **D4** Every form in a dialog: Change price, Count stock, Move stock, Open
   and Close shift, New stock item, New location, the price lists, and the
   management surface's own create form (`CreateDialog`, which was a sheet).
10. **D5** App-bar navigation buttons are gone; each page keeps its one verb.

### Phase C — one voice

11. **§3, §4** Names and sentences, back office and till, through
    `lib/retail/words.ts` — one label per tender, status, movement and date.
12. **D6, D7, D9** Status as exception, sentence-case columns, day-first dates
    in the shop's time zone, a true minus on a signed figure.

### Phase D — proof

13. `e2e/retail-journeys.spec.ts` walks the workflows above against `acme` and
    photographs every step into `docs/screenshots/retail/journey-w*`.

---

## 6. Found on the way

- **Refunds and voids are not fiscalised when posted online.** The sale route
  now fiscalises after it commits (`fiscaliseAfterPosting`); the same two lines
  belong in `app/api/v2/retail/pos/sales/[id]/refund/route.ts` and
  `…/void/route.ts`, where a reversal becomes a credit note against the
  original's receipt. Left for a separate change.
- **The till's host serves the workspace's sign-in form** (`#login-email`,
  "Request a workspace") rather than the till's own (`PosPortalLoginClient`,
  `#portal-email`) when the host is nominated through the preview cookie. A
  cashier still signs in and lands on the till. `e2e/_support/auth.ts` now
  accepts either form.
- **The demo range is priced at an expired VAT rate.** Standard-rated VAT has
  been 15.5% since 1 January 2026; `seed-retail-demo.ts` gives every product
  15%, and the tenant's `VAT15` code ends on 31 December 2025. A till sale of
  a seeded product is refused fiscalisation as "no active tax code charges
  15%" — correctly. The journey spec's own product is priced at 15.5%. New
  products still default to the rate most of the range carries; defaulting to
  the shop's current standard rate needs a read of its tax codes.
- Zero-rated and exempt codes stay unmapped after registration (Phase A item
  3), and there is still no screen that sets a tax code's ZIMRA taxID by
  hand. A shop that sells zero-rated or exempt goods at the till cannot
  fiscalise those sales until one exists.
- `/crm/cost-tracker` throws a client-side exception on `acme` ("Application
  error"). Not investigated here.
- The accounting module draws its sidebar twice — the workspace rail and a
  second in-page rail with the same fourteen entries.
- Retail keeps three settings (setup profile, till rules, tender policy) as
  rows of `FiscalisationProviderConfig`. `lib/accounting/fiscal-device-scope.ts`
  keeps them out of every device lookup; moving them to a table of their own is
  the lasting fix.
