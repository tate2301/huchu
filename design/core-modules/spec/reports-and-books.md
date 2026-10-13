# Reports and Books

## Reports

- **The rule:** a report stores SQL and the rows it returns. Steps, the builder, insights and Vane's answers are views over the SQL. Changing a step rewrites the SQL; editing the SQL rewrites the steps where it can and says so where it can't.
- Reports run in the browser on PGlite in a worker, over the workspace's synced, read-only data. Results show their row count and time.
- **All reports** (`reports`): Yours and shared, then From Corelith (built-in, "Make it yours" copies one into the builder). Panel: Overview, Insights, All reports, Yours, Shared with you, From Corelith, folders, and Build (Forms, Documents).
- **A board** (`report`): finding sentence, the controls (dates, fitter, subfloor), blocks, the table with its footer sums. "As of" time at the end of the controls.
- **The builder** (`report-build`): see `shell.md`. Questions are named in lower case as SQL views are (visits, by subfloor, totals). Columns in results keep their SQL names.
- **Insights** (`reports-insights`): written by Vane each Monday at 06:00. Each one is a headline fact, two sentences, a small chart or list, and a footer: the question it ran (opens it), its action, Pin to Monday board, Not useful.
- Reports differ by vertical: the catalogue and From Corelith change; the base does not.

## Books

Books is never on its own: it reads what the products hold (Tender's tills, CRM's deals and quotes) and turns it into money in, owed, the bank and VAT.

- **Money** (`books-money`, `books-vane`): finding (in this month, owed, overdue); Where it came from (showroom sales and invoices with share bars); Needs you (when the Vane panel is closed) or the Vane panel (when open); the bank position.
- **Invoices** (`books-invoices`): full-bleed table, selection with sums in the footer, Send reminders on WhatsApp and Print statements as bulk actions.
- **Bank** (`books-bank`): account menu; To match, Matched, Everything; each line shows the bank's description in mono, the amount (money in green), Vane's match with its source and reason, Accept and Choose. "Accept Vane's 3" accepts all its matches at once, still a person's press.
- Money: currency and both decimals everywhere; US dollars and ZWG side by side where an account holds both.
- Integrations Books relies on: EcoCash (pay links and settlements), WhatsApp Business (reminders), the ZIMRA fiscal device, CBZ statements (uploaded weekly; CBZ has no feed yet).
