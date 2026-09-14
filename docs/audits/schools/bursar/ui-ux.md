# Bursar dashboard: UI/UX audit

Surface: `app/schools/finance/**` and their content components `components/schools/fees/{fees-grade-picker,class-fees-content,schools-fees-content,fee-dialogs,bulk-generate-invoices-dialog,copy-structure-dialog,fee-status}.tsx`, `components/schools/reports/reports-arrears-content.tsx`, plus the fee tabs of `documents/school-documents-content.tsx`. Audited from source and from `docs/screenshots/schools/fees/*`, `finance-desktop/*`, `finance-phone/*`, `visual-pass-*/01-class-fees.png`. Workflow companion: `workflows.md` in this folder.

Rules applied: `docs/ux/platform-ux-playbook.md`, `docs/design-system/{05-rules,08-cookbook-patterns,12-tables}.md`, `09-campus-canvas-law.md`, `10-campus-screen-contract.md`, `11-campus-states-and-motion.md`, `.impeccable.md`, `SPEC.md`. The rule digest is in `../reference/docs-baseline.md` §9 and `../reference/backoffice-ui-ux-evidence.md` §0.

## 1. Verdict in one paragraph

The bursar's screens have the best confirmation and reason-capture copy in the module ("$ 510.00 is unwound: every invoice this receipt settled goes back to owing. This cannot be undone.") and the receipt dialog's allocation logic is right. They fail on the surface in ways a bursar meets every hour. Row verbs on every fee screen are clipped off the right edge at desktop, tablet and phone widths because `RecordActions` is rendered inline, so "Take payment" reads "Tak". The landing page has no primary action; "Record receipt" is two screens away. The ledger on a phone spends the entire first screen on chrome and shows no invoice. Three surfaces compute ageing in three code paths with different bucket labels (they agreed on the seeded data, and disagreed in an earlier screenshot set). The bill's status vocabulary differs between the ledger and the students list. And the arrears and reports pages ship the designer's rationale as product copy.

## Runtime check (14 September 2026)

Verified on the seeded St Marys tenant (see `../reference/runtime-verification.md`). Confirmed at runtime: 28 of 49 buttons on the class fees page sit past the right edge of a 1440px viewport ("Take payment", "Write off" clipped); the first invoice on the phone ledger sits at 973px, below an 844px screen; the rationale cards on arrears and reports render; the "Outstanding 29,910" chip has no currency; the bursar's sidebar shows Result sheets, Homework and Scheme of work. Corrected: the ageing surfaces agree on this data.

## 2. Screen-by-screen

| Route | Component | Contract violations | Friction | Role awareness | Phone | Severity |
|---|---|---|---|---|---|---|
| `/schools/fees` | redirect to `/schools/finance` | Nav says Fees, URL says finance | | | | P2 |
| `/schools/finance` | `fees-grade-picker.tsx` | In-page `PageHeading` "Fees and finance" plus app-bar "Finance"; seven band chips including "Classes 0" beside "Year groups 6"; three band actions and no primary; year-group table in a card, not full bleed; the collected progress bar painted danger red; "Find a year group" search alone on its row | Rows are not visibly links; "Longest overdue" rows have no verb; "Send reminders" goes to all overdue with no preview of who | No `useSchoolAccess`; reminder button not gated on the route's real permission | Six numeric columns will scroll sideways | P1 |
| `/schools/finance/class/[classId]` | `class-fees-content.tsx` | `PageHeading` "Form 1 fees" plus bar "Year group"; paragraph repeating the band chip (`:206`); inline `RecordActions` "Take payment · Write off · Edit" stacked and clipped (`:326-360`); "Write off" as a solid red button on every unpaid row | Record a receipt from here is two clicks, the best path in the module, if the button were visible; no family-level payment; no running total of today | Verbs gated by `RecordActions` | Rows already card-shaped; verbs still clip | P0 |
| `/schools/finance/ledger?view=invoices` | `schools-fees-content.tsx` (2,197 lines) | `PageHeading` "Fee ledger" with a caption repeating the chips (`:1352-1357`); each panel adds an `h2` (fourth name); six filters with two native date inputs (`:1461, :1472`) and "Owing at least" without currency; "Showing the first 100 of 120" banner instead of the pager; a second search row; inline row verbs on invoices (`:723`), refunds (`:994`), waivers (`:1137`), structures (`:1270`) while receipts (`:825`) and credits (`:925`) correctly use `layout="menu"` | Two "Record receipt" primaries on the empty receipts view; no bulk issue for drafts; no saved views; no keyboard | `CreateButton` per view gated correctly | First invoice below the fold at 390×844; no `mobileListRenderer` so a nine-column table scrolls sideways | P0 |
| `…?view=receipts` | same | Nine columns | Void confirm copy exemplary | gated | none | P1 |
| `…?view=credits`, `…?view=refunds` | same | Refund "Pay / Cancel" inline | Raising a refund from a credit lands on Credits while the refund lives on Refunds, with no link | gated | none | P2 |
| `…?view=waivers` | same | Up to six inline buttons per row | Approve-now toggle in the form is good | gated | none | P1 |
| `…?view=structures` | same | Inline verbs; "New fee sheet" vs tab "Fee structures" vs nav "Ledger and structures" | No preview before bulk generate | gated | none | P2 |
| `/schools/finance/arrears` | `reports-arrears-content.tsx` | `PageChrome` with "Remind the N" primary (good); `toFixed` and `toLocaleString` for money; rationale cards "The missing verb" and "Why these buckets" rendered as UI (`:797-812`) | No per-family "Take payment" from the row; family phone not on the row | `useSchoolAccess` used; button correctly disabled for BURSAR, which means the bursar cannot chase from here at all | none | P0 (copy leak) |
| `/schools/reports` (arrears tab) | `schools-reports-enhanced-content.tsx` | Chip "Outstanding 29,910" with no currency (`:715`, confirmed at runtime); the chart and chip agreed with the finance page on the seeded data but are computed separately; "The missing verb" and "What the screen cannot do" cards (`:1090`) confirmed at runtime | Export in the band is good | | none | P0 (copy leak) |
| `/schools/documents` (fee invoice tab) | `school-documents-content.tsx` | Title Case throughout; raw enum status printed | Receipt and statement have no tab; no batch print | | none | P1 |

## 3. Screenshot findings

- **Finance overview (desktop).** Good: per-form billed, collected and outstanding with a bar and percentage; ageing list; longest-overdue list with "90d" in mono red; currency caption. Wrong: page named twice; seven chips; no primary; collected bars in red; rows not clickable; the search alone on a row.
- **Invoices.** Good: mono invoice numbers, `$ 510.00`, `20 September 2026`, status badges. Wrong: header, caption and bar all name the page; six filters with two `mm/dd/yyyy` inputs; "first 100 of 120" banner; a second search row; "Edit / Write off (red) / Print" inline per row with Print clipped; rows around 90px.
- **Arrears.** Good: "Remind the 75" in the bar; CSV and PDF export. Wrong: "Outstanding 29,910"; Title Case tabs; filters over two rows; the chart contradicting the chip; rationale cards; a second search below the chart.
- **Receipts.** Good: the empty-state sentence. Wrong: two "Record receipt" primaries while the view is empty (one once a receipt exists); table header, empty state and pagination all rendered; four filters including two native dates.
- **Finance phone (390×844).** No record visible on the first screen: five chips over three rows, a tab strip clipped mid-word, six stacked filters, the banner, the search at the bottom edge.
- **Class fees (desktop, tablet, phone).** Good: rows are the right shape (avatar, "Surname, First", mono invoice number, term, billed, outstanding, status). Wrong: three stacked verbs clipped at every width; red "Write off" per row; caption repeating the chip; bar title "Year group".

## 4. Rule violations that recur

| Rule | Violation | Where |
|---|---|---|
| A page is named once | In-page heading plus bar title on overview, class, ledger | three screens |
| One primary in the bar | None on overview; two on the receipts view | two screens |
| Row verbs in a menu; one inline primary | Inline stacks clipped | five views |
| One control row, one search | Two search rows on the ledger and arrears | two screens |
| Money carries currency; dates as `3 June 2026` | Chip without currency; `toFixed`; native dates | three screens |
| Never the same fact twice | Caption repeating chips; "Classes 0" | three screens |
| Colour marks what to stop on | Collected bar in red; "Write off" as a red button at rest | two screens |
| Strip explanatory copy | Rationale cards | arrears, reports |
| One status vocabulary | Ledger: Draft, Issued, Part paid, Paid, Written off, Voided; students list: Paid, Partial, Overdue | two screens |
| The first phone screen belongs to the records | No invoice above the fold | ledger |
| Ratios with a zero denominator render as "—" | "0%" on the dashboard fee panel | overview |

## 5. Suggested edits

1. **Row verbs (P0).** `layout="menu"` on `class-fees-content.tsx:326`, `schools-fees-content.tsx:723, 994, 1137, 1270`, with one inline primary per row where the row has an obvious verb: "Take payment" on an unpaid invoice, "Approve" on a submitted waiver, "Pay" on a requested refund. The receipts view already does this.
2. **One ageing (P1).** One endpoint, one bucket definition, one `AgeingStrip` component consumed by the overview, the reports page and the dashboard, so the three cannot drift again.
3. **Phone ledger (P0).** Drop `PageHeading`, drop the caption, keep two chips per view, put the six filters behind one "Filter" sheet with a count badge, use the DataTable pager instead of the banner, add a `mobileListRenderer` (two lines, balance on the right, chevron). That lands the first invoice near y=300.
4. **Currency and dates (P1).** `schools-reports-enhanced-content.tsx:715` through `formatSchoolMoney`; every `toLocaleString` and `toFixed` in the fee and report components through `lib/schools/format.ts`; native date inputs to the design-system picker (sheet on phone).
5. **Remove rationale cards (P0).** `reports-arrears-content.tsx:797-812`, `schools-reports-enhanced-content.tsx:1090-1100` to comments or docs.
6. **Landing primary (P1).** `PageChrome` with "Record receipt" opening `ReceiptFormDialog` with an `InvoicePicker`; year-group rows as links; a `···` on longest-overdue rows with "Take payment" and "Remind".
7. **Receipt dialog (P1).** Show "Outstanding on SFI-00120: $ 510.00" under the picker; live "Balance after / Credit created" as the amount is typed; method as a labelled select defaulting to Cash; date via the picker; a "Print receipt" checkbox that fires the receipt document after save.
8. **Status vocabulary (P1).** `InvoiceStatusBadge` everywhere; "Overdue" as a filter chip (due date past and balance above zero), not a status.
9. **Bulk actions (P1).** Selection bar on invoices (issue drafts, print, remind), on structures (activate), on waivers (approve).
10. **Bulk generate preview (P2).** "This will raise 20 invoices totalling $ 9,800" before confirm.
11. **Refund thread (P2).** After raising a refund, switch to `?view=refunds` and highlight the new row, or toast "Open refund RF-0007".
12. **Documents (P1).** Add receipt and statement tabs; batch statement by class; sentence case.

## 6. Proposed restructuring

- **`/schools/finance` becomes the bursar's dashboard** (see §7), with the year-group table below the hero.
- **The ledger's six views stay as one route** with `?view=`, but the filters collapse to the two that matter per view plus a sheet for the rest; saved views ("Owing over $500 in Form 3", "Unfiscalised this week") as chips in the strip.
- **A family view** reached from any invoice or receipt: household, all children, balance, statement, receipts, reminders sent, calls logged.
- **Reminders and calls live on the arrears row**: "Remind" (send), "Log a call" (outcome and note, no send), "Take payment". The bursar must be able to use all three.
- **Rename the nav band "Fees"** and keep it as the bursar's first band with `preferredHomeHref = /schools/finance`.

## 7. Proposed new UI

**Bursar dashboard (`/schools/finance`)**
- Bar primary: Record receipt. Band chips: Outstanding, Overdue with family count, Collected this term %, Credit on account.
- Hero: Collected vs billed this term with a progress bar and "same day last term" delta.
- KPIs (two-up on phone): Today's takings with receipt count (link to receipts filtered to today); Draft invoices not issued (link to issue all); Receipts not fiscalised (link to the ZIMRA queue); Refunds awaiting payment.
- Year-group collection table with row links and a `···`.
- Panels: Ageing (the one component); Longest overdue with verbs; Recent receipts, printable; Payment-method mix this week for cash-up.
- Empty state on a new term: "No invoices raised for Term 3 yet" with "Bulk generate" as the verb.

**Counter mode.** A focused receipt screen for the office window: student or family search, outstanding invoices with amounts, amount and method, change due for cash, print on save, next family. One screen, keyboard-first, usable on a tablet.

**Cash-up screen.** Per cashier per day: opening float, receipts by method, counted cash, variance, deposit slip, close.

**Reminder composer.** Preview of who will receive it (name, child, balance, channel), template with merge fields, cost estimate for SMS, send, then delivery status on the arrears row.

**Interaction patterns to add:** command palette verbs ("Record receipt", "Go to arrears"), URL-synced filters and saved views, undo toast for discard, peek on the student in an invoice row, a date stepper for receipts by day, and route-level `loading.tsx` and `error.tsx` under `app/schools/finance`.

## 8. Accessibility

- Row verbs hidden by clipping are also unreachable to keyboard users who cannot see focus land off-screen; the menu fixes both.
- The red "Write off" button at rest has the same tone as an error; keep destructive tone for the confirm, neutral at rest.
- Money in a monospace face with slashed zeros is hard to read at 11px; keep tabular figures in the sans face for amounts and mono for references.
- Native date inputs announce in the browser's locale; the picker fixes the format and the announcement.
