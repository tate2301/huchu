# 69 · Statements and account reminders (CUS-09)

## Screen
- Sheet `statement` over Accounts (`/retail/accounts?sheet=statement&ids=<accountIds>`, bulk "Send statements"; row menu and the record's ⋯ "Send a statement" with `&id=<accountId>`).
- Account reminders through packet 55's `message` sheet (`?sheet=message&purpose=reminder&about=account:<ids>`, Accounts bulk "Remind on WhatsApp").
- The statement PDF (documents source `retail.account.statement`).

## Units
CUS-09.

## Boards
- `StatementSend.png`: sheet "Send statements" / "4 accounts owing". "Covering" seg "**September** · Last 30 days · Since opening"; "Send by" seg "**WhatsApp** · Email · Print"; "Message" area "Hello, your Harare Bottle Store statement is attached. Pay by EcoCash 0921 774 or CBZ 1002 4471. Thank you."; footer note "Each statement lists sales, payments and what is overdue."; "Cancel"; primary "Send 4 statements".

## Workflows
- **W-49 (statement)**: pick accounts · covering · send by → `POST /api/v2/retail/accounts/statements`; reminders "Remind on WhatsApp".

## Roles
`retail.accounts:update` (owner, manager, bookkeeper) sends statements and reminders; `retail.accounts:view` prints/reads a statement PDF. Accounts: owner `owner@bottlestore.test`, manager `tafara.manager@bottlestore.test`, bookkeeper `bookkeeper@bottlestore.test`, cashier `chipo.till@bottlestore.test` (`RetailDemo123!`).

## Data
Existing: accounts, charges, payments, allocations (packets 66–67); `RetailMessage` (+ media, `batchId`, `customerId`), `RetailMessageBatch` (purpose STATEMENT, packet 55), company branding (`lib/documents/branding-snapshot.ts`), `buildPaymentRows` (`lib/documents/payment-details.ts`), SET-05's EcoCash merchant code, the default bank account. No migration.

## Server
- **Documents source** `retail.account.statement` in a new `lib/documents/retail-sources.ts` (registered in `lib/documents/source-registry.ts`; default template in `default-template-catalog.ts`; sample payload in `sample-payloads.ts`; pattern `schools-sources.ts`). Payload `lib/retail/accounts/statement.ts#statementFor(companyId, accountId, covering, today)`:
  - Window: `LAST_MONTH` = the last full calendar month ("Covering September 2026"); `LAST_30_DAYS` ("Covering the last 30 days"); `SINCE_OPENING` ("Since 12 March 2024").
  - **Opening balance** = owed at the window's start (charges before it − credits and payments before it). Lines in date order: charges "Sale on account, bought by Tonderai Dube" (Charge column), credits "Refund" (Payment column), payments "Payment, bank transfer, CBZ 0310 4412" (Payment column), each with its reference (sale number / PMT number) and the running Balance. **Closing** = opening + Σ charges − Σ credits − Σ payments in the window, which must equal `owes` as at the window's end (asserted in tests). "Overdue: US$212.40" (as at today). Payment details from `buildPaymentRows(branding)`.
- **`sendStatements(actor, { accountIds (1–500), covering, sendBy, message (≤ 600) })`**:
  - WHATSAPP: per account with a WhatsApp number (`whatsapp ?? phone`), the PDF uploaded through `lib/uploads/upload-file.ts` (company folder `statements/`, a signed link valid 7 days) and an outbox `RetailMessage` (`channel WHATSAPP`, template `statement`, `mediaUrl`, `mediaName` "Statement September 2026.pdf", `mediaKind DOCUMENT`, body = the message as the caption) in a `RetailMessageBatch` purpose STATEMENT.
  - EMAIL: per account with an email, an outbox `RetailMessage` (`channel EMAIL`, subject "Your statement from Harare Bottle Store", the PDF as `mediaUrl`) — the drain's email path attaches `mediaUrl` (extend `lib/retail/messages/drain.ts` to fetch and attach media for email if it does not yet).
  - PRINT: no messages; returns `printUrl` (`GET /accounts/statements/print?ids=&covering=`).
  - Accounts without the number/email are skipped and named (`skipped: [{ name, why: "has no WhatsApp number" }]`). **C-04**: with WhatsApp or email not configured nothing fails — messages stay queued and the response carries `waiting: true`.
  - Audit `RETAIL_ACCOUNT.STATEMENT_SENT { accountId, covering, sendBy, closing }` per account (entity `Customer`): "Sent the September statement on WhatsApp" (hollow).
- **Reminder source `account`** (packet 55's registry): requires `retail.accounts:update`; placeholders `{first name}`, `{owed}`, `{overdue}`; default body "Hello {first name}, your Harare Bottle Store account owes {owed}. Pay by EcoCash 0921 774 or CBZ 1002 4471. Thank you." (the EcoCash merchant code from SET-05 and the default bank account's bank and number; a missing part is left out); hint "{first name}, {owed} and {overdue} fill in for each account."; sub "4 accounts · 4 with a WhatsApp number"; template `account-reminder` (re-filled at send time by the drain). Done "Reminders sent to 4 customers.".

**Routes**
| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/api/v2/retail/accounts/statements/preview?ids=` | `retail.accounts:update` | `{ count, owing, sub /* "4 accounts owing" / "4 accounts, 3 owing" / "Mbare Sports Club · owes US$612.40" */, lastMonth: "September", body }` |
| POST | `/api/v2/retail/accounts/statements` | `retail.accounts:update` | `z.object({ accountIds: z.array(uuid).min(1).max(500), covering: z.enum(["LAST_MONTH","LAST_30_DAYS","SINCE_OPENING"]), sendBy: z.enum(["WHATSAPP","EMAIL","PRINT"]), message: z.string().max(600) })` → `{ sent, skipped, printUrl?, waiting }` |
| GET | `/api/v2/retail/accounts/statements/print?ids=&covering=` | `retail.accounts:view` | one PDF, a statement a page |
| GET | `/api/v2/retail/accounts/[id]/statement?covering=` | `retail.accounts:view` | one PDF |

## UI
- Sheet `statement` (`lib/retail/sheet-kinds/customers.ts`), `load` = preview. Title "Send statements" (one account "Send a statement"); sub from the preview. Fields: `period` seg "<last full month>" (from `lastMonth`), "Last 30 days", "Since opening" (default the month); `how` seg "WhatsApp", "Email", "Print" (default WhatsApp); `msg` area 3 rows (not drawn for Print), default the preview's body, ≤ 600. Note "Each statement lists sales, payments and what is overdue."; primary "Send 4 statements" / "Send the statement" / "Print 4 statements". Done "4 statements sent on WhatsApp." / "4 statements emailed." / "4 statements ready to print." (Print opens `printUrl` in a new tab); skipped accounts make it a warn toast naming them ("3 statements sent on WhatsApp. Highfield Shebeen Co-op has no WhatsApp number."); `waiting` → "… They go once WhatsApp is connected.". requires `[["retail.accounts","update"]]`.
- Accounts list: row menu "Send a statement" (`?sheet=statement&id={id}`); bulk "Send statements" (`?sheet=statement&ids=…`) and "Remind on WhatsApp" (`?sheet=message&purpose=reminder&about=account:{ids}`) — `retail.accounts:update`.
- Customer record: ⋯ "Send a statement" (an account; `retail.accounts:update`); the Account tab's footer link "Send a statement".

## Reuse
`lib/documents/{source-registry,html-renderer,pdf-renderer,payment-details,branding-snapshot}.ts`, `lib/uploads/upload-file.ts`, packet 55 (`message` sheet, reminder registry, batches), packets 66–67 (balances, lines), `lib/retail/messages/drain.ts`, `lib/email/send.ts`.

## Remove
Nothing.

## Seed (`seedStatements`)
One statement sent: Highfield Shebeen Co-op, August, WhatsApp, by Tafara Nyathi on 1 September (a STATEMENT batch, its message SENT with a document, and the audit event).

## Tests
- `lib/retail/accounts/statement.test.ts` (test DB): opening + charges − credits − payments = closing and equals owed at the window's end for each covering; overdue as at today; Mbare's September shows the opening at 1 September, the September charges with their buyers, the payment and "Overdue: US$212.40".
- `lib/retail/accounts/statements-send.test.ts`: WhatsApp messages carry a DOCUMENT media link; skipped accounts named; Print returns one PDF of n pages; no credentials → queued with `waiting`.
- `lib/documents/retail-sources.test.ts`: the source renders with the sample payload.

## Acceptance
1. Accounts: tick the four owing → "Send statements" beside `StatementSend.png`: sub "4 accounts owing"; "September" and "WhatsApp" selected; the default message → "Send 4 statements" → "4 statements sent on WhatsApp."; four outbox rows with a document link; Mbare's PDF shows the opening balance at 1 September, the September charges with buyers, the payment, the closing balance, "Overdue: US$212.40" and the CBZ payment details.
2. "Print" → "Print 4 statements" opens one PDF of four pages. "Email" with two customers lacking an email → a warn toast naming them.
3. "Remind on WhatsApp" → the reminder sheet ("Remind on WhatsApp", "4 accounts · 4 with a WhatsApp number") → "Send to 4" → "Reminders sent to 4 customers."; Mbare's body names US$612.40.
4. Cashier: no Accounts; the API → 403.
5. eslint, named tests, one `pnpm typecheck`.

## Depends on
Packet 67 (CUS-08: payments, allocations), packet 55 (CUS-06: message sheet, reminder registry, batches), packet 66 (accounts list/record items). Locks **M** (messaging/drain media for email), **CR** (record).

## Risk
money (the statement states what a customer owes; it must reconcile to the ledger of charges and payments). Pitfalls: opening/closing arithmetic over the window; signed links expire (7 days); C-04 queueing without credentials.

## Open questions
- Email statements go through the one outbox drain (C-03) with the PDF as media, not a direct `sendEmail` call.
- Accounting's AR reports still do not list retail charges (spec open question 8, unchanged).
