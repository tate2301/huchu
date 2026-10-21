# The posting engine

The core every workspace has, with or without the Books screens. Modules never write ledger entries. They emit **money events**; the engine turns each one into a balanced journal through a posting rule.

## Money events

| Event | From | Debit | Credit |
|---|---|---|---|
| Sales invoice issued | Books, CRM | 1100 Debtors | 4000 Sales · 2200 VAT output |
| Receipt recorded | Books, CRM | The money account chosen | 1100 Debtors |
| Requisition disbursed | CRM, Retail | 1150 Cash advances | The money account chosen |
| Requisition accounted for | CRM, Retail | Each receipt's expense · 2210 VAT input | 1150 Cash advances |
| Claim approved | CRM cost tracker | Each line's expense · 2210 | 2190 Staff claims payable |
| Goods received | Retail (GRN) | 1200 Stock | 2010 Goods received, not billed |
| Supplier payment | Books, Retail | 2000 Creditors · 6930 IMTT | Money account · 2180 Withholding payable |
| Pay run approved | Payroll | 5200 Wages · 5210 Employer costs | 2100 Net pay · 2110 PAYE · 2130 AIDS levy · 2120 NSSA · 2140 ZIMDEF |
| Day close | Tender | 1030 till float · 1020 EcoCash · 1040 Card clearing · 6990 Till differences | 4010 Showroom sales · 2200 VAT output |

The rules are data (`bk-posting-rules`, Ledger, Posting rules: 41 rules, 6 Tender mappings in the fixture). Category to account mapping is part of a rule. The posting blocks on every record page (`postBlock` in `source/bk0.mjs`) show the exact lines each fixture posts.

## Failure, never silence

- An event with no rule, or a category with no account, **fails** with its reason. It waits in Close the month, Needs posting (`bk-needs-posting`), with a one-click fix ("Map Fuel"). Nothing is dropped.
- Queued events retry: next run, then every 15 minutes, backing off to a day. Waiting over an hour shows in Needs posting.
- Failed events and unsigned fiscal documents block the month's close.
- Posting is idempotent per event id. A retry never double-posts.

## Documents and the ledger

- Gapless numbering per series at issue (`bk-set-numbering`). Drafts carry no number.
- Each document stores its frozen rate (ZWG documents stay in ZWG and post in USD at the frozen rate) and its tax code in force on the date of supply.
- Void posts the exact mirror, dated in an open month. Revise is void plus a new document linked both ways. Delete posted removes the document, its lines, its journals and its sub-ledger lines, and writes a full copy to the audit trail.
- Payroll and Retail own their own corrections. "Books never edits a pay run": a wrong run is reversed in Payroll and the books get the mirror. Takings are corrected on the floor's end of day.
- Every entry carries who, when, from which module and, for superusers, the session number. The audit trail (`bk-audit`) is append-only.

## Bank matching

- Statements come in by upload (CSV or the bank's file) per money account (`bk-match`).
- Vane proposes a match per line with what it read ("Read: REC-0097 and INV-0142's balance"). A person accepts, one by one (A) or the batch (Shift A). Bank charges with no document become new entries (IMTT, fees) by Create (C).
- A reconciliation closes when the statement and the books agree for the period (`bk-reconciliation`). A closed reconciliation locks its lines against delete.

## Revaluation

Rates come from the RBZ interbank feed at 06:00. Month end posts the revaluation of ZWG balances (`bk-rates`, V). The checklist needs the month-end rate present and the revaluation posted.
