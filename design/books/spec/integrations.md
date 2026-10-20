# Books inside other modules

These pieces are core: free, in every workspace, with or without the Books screens. Each is built once as a shared component and placed in the module. Where Books screens are absent, the piece stays and only its "Open in Books" link goes.

| Where | Screen | The piece | Rules |
|---|---|---|---|
| CRM, a deal | `bk-x-crm-deal` | "Money on this deal": quote, invoice (Vane drafts it from the accepted quote), deposit, paid, cost so far from the deal's cost centre, requisitions, committed, margin so far. Primary: Issue the invoice (I) | The invoice is issued, fiscalised and posted from the deal. Margin counts what is committed |
| CRM, requisitions | `bk-x-crm-reqs` | Books' requisitions list, filtered to the CRM. Ask for money (N); Approve (A) on a selection | Same approval as in Books: the limit, the snapshot, nobody approves their own |
| CRM, cost tracker (phone) | `bk-x-crm-cost` | A fitter's day: spent against a requisition, cash taken from customers, own money. Send the day in | Sending posts: receipts account for the requisition (change to hand back), cash taken becomes a receipt into the fitter's site cash until banked, own money becomes a claim |
| Retail, end of day | `bk-x-retail-eod` | Expected, counted and difference per tender; where each goes; the posting preview. Mark banked (B) | Takings are corrected on the floor, never in Books. Queued, then posted on the next run |
| Retail, goods in | `bk-x-retail-grn` | GRN posting (Stock against Goods received, not billed) and the draft bill. Open the draft bill (B) | The bill waits for the supplier's FTI; once checked on FDMS it clears GRNI and claims the VAT |
| Payroll, a pay run | `bk-x-payroll` | Gross to net, employer costs, what the run leaves to pay (PAYE and AIDS levy, NSSA, ZIMDEF) with drafted payments, the posting. Pay out (P) | Books never edits a pay run; Payroll reverses and Books gets the mirror |
| Reports | `bk-x-reports` | Eight reports that read the books directly (P&L, money this month, owed by age, you owe by age, job cost, cash in the bank, VAT by month, spending by category). New report (N), Make it yours | They run without the Books screens. The accountant export gives the same figures as files |
| Phone | `bk-p-money`, `bk-p-approve`, `bk-p-voucher` | The owner's Money, a manager approving a requisition with Vane's note, a float holder writing a petty cash voucher | Approve and Reject with a reason; the approver's limit shown |
| Management | `bk-mg-*` | Money and tax, Money accounts, Approvals (limits and chains), Accountant export, People (outside accountant) | Setup is free and lives in Management, with or without the screens |

Plan gating on these pieces: none. They are core.
