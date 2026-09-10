# The five demo tenants

All on one origin — `http://acme.apps.pagka.local:300` — switched with
`?__tenant=<slug>`. See [environment.md](environment.md).

Every one carries deliberate exception rows. Those are the demo, not the
decoration: see the note at the end of [README.md](README.md).

---

## 1. Retail — a Harare bottle store

**`?__tenant=acme`** · password `RetailDemo123!`

| Role | Email |
|---|---|
| Manager | `tafara.manager@bottlestore.test` |
| Cashier | `chipo.till@bottlestore.test` |
| Cashier | `farai.till@bottlestore.test` |
| Stock clerk | `tendai.stock@bottlestore.test` |
| Owner | `owner@bottlestore.test` |

**What is in it:** 180 days of trade — 5,158 sales, 240 shifts, $87,021 takings,
priced in USD at 15% VAT, taking cash, card, EcoCash and ZWG.

**Beats to hit**
- Ring a sale at the till — the POS portal is its own host, and a cashier signing
  in anywhere is bounced to it, because a cashier has no business anywhere else.
- **433 sales settled partly in ZWG.** Dual currency is the thing every
  Zimbabwean retailer asks about first.
- The reversal flow: a manager authorises a refund by keying their own login
  into the approval box at the counter. They never take over the till.

**Wrong on purpose:** shifts that came up short *and* over; Castle Lager 340ml
below its reorder point (the best-selling line, so the low-stock alert points at
something the owner cares about); a purchase order part-received; 94 refunds;
11 voids; a held cart nobody came back for.

---

## 2. School — St Marys High School

**`?__tenant=stmarys`** · password `SchoolDemo123!`

| Role | Email |
|---|---|
| Head | `head@stmarys.test` |
| Teacher (HOD) | `grace.mutasa@stmarys.test` |
| Student portal | `student@stmarys.test` |
| Parent portal | `parent@stmarys.test` |

**What is in it:** 120 pupils across 6 forms, 8 teachers, 119 guardians, a term
of registers (90 sessions, 1,800 marks), 156 assessments with 3,100 scores, and
120 fee invoices.

**Beats to hit**
- The roll, then a pupil record — attendance percentage and fee status sit right
  on the row.
- **All three portals.** Sign in as the parent and show them their own child's
  attendance and invoice. This is usually the moment a school buys.
- Fees: paid, part-paid, overdue, all visible in one list.

**Wrong on purpose:** one pupil suspended (still on the roll, still in the class
they will come back to); **one pupil with no guardian on file**; a pupil at
**46.7% attendance** next to classmates at 100%; twelve invoices genuinely
overdue; one exam left unmarked; one pupil marked absent for an assessment.

---

## 3. Gold mine — Huchu Enterprises

**`?__tenant=huchu-enterprises`** · password `GoldDemo123!`

| Role | Email |
|---|---|
| Manager | `nyasha.mudzingwa@huchu-enterprises.test` |
| Clerk | `tapiwa.chuma@huchu-enterprises.test` |
| Admin | `mine@huchu-enterprises.test` |

**What is in it:** a quarter of mining across three shafts — 154 shift
allocations, 931 worker shares, 6 pours, 5 dispatches, 4 buyer receipts, 90
daily gold prices, one closed period.

**Beats to hit**
- The split. Gold recovered on a shift is divided between the crew and the
  company, and every gram is accounted to a named person. Show a worker share.
- Follow one bar: shift → allocation → pour → dispatch under seal → buyer
  receipt with an assay.
- **Gold in transit.** One bar is dispatched and not yet receipted; another is
  still in the safe. This is what a mine owner lies awake about.

**Wrong on purpose:** one allocation still in draft and one awaiting approval;
13 shifts split away from the default 50/50 *with a stated reason*; an open
inventory-deficit exception alongside an acknowledged and a resolved one; a
closed period the system will refuse to let you post into; one day with no gold
price, so the fallback path is live.

---

## 4. Service provider — Hurudza Creative

**`?__tenant=hurudza-creative`** · password `Password123!`

| Role | Email |
|---|---|
| Owner | `tafadzwa@hurudza.test` |

**What is in it:** a year of trading — 35 companies, 108 people, 180 leads, 90
deals, 1,165 activities, 57 quotations, 22 invoices, 20 receipts, spread across
twelve months rather than all dated today.

**Beats to hit**
- A record page with a year of timeline on it. Six activities scroll; 1,165 look
  like a business.
- Quote → invoice → receipt, and the collections note when it does not arrive.
- The pipeline narrows the way a real one does: more quotes than invoices, more
  invoices than receipts.

---

## 5. Payroll, HR and accounting — Kariba Payroll Bureau

**`?__tenant=payroll-demo`** · password `Password123!`

| Role | Email |
|---|---|
| Admin | `rudo.chirwa@payroll-demo.test` |

**What is in it:** a dual-currency workforce, an approved August 2026 run with a
posted journal, leave balances, and the Zimbabwe statutory pack.

**Beats to hit**
- **The seam.** Run payroll, then open accounting and show the journal it wrote,
  then the trial balance still balancing. Three screens, one story: the thing
  most competitors make you reconcile by hand.
- Statutory returns, in the local shape.

**Wrong on purpose:** one employee with **no BP number**, so the run reports a
blocker instead of quietly paying everyone else and losing one. A payroll module
that hides an unpayable employee is worse than one that has none — the money
does not move and nobody is told.
