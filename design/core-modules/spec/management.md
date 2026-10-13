# Management

The redesign keeps the live app's tree and routes and draws them with the clean sidebar (`shell.md`). Billing, which lists the apps a workspace has, moves here from Settings, with Integrations, Marketplace and Vane in a new Apps group.

- **Job grades** (`management-job-grades`): the existing page on the new layout. The uppercase event chip (`JOB_GRADE.CREATED`) is removed; activity reads "James Nyabadza created this grade" with the date.
- **Billing** (`management-billing`): the monthly total and next payment as the finding; Products with their monthly price; Core modules marked Included (Books, Reports and insights, Forms and documents, Vane with its jobs this month); Add-ons with price and Add; Paying (method and Change, then Corelith's invoices with Download).
- **Integrations** (`management-integrations`): Connected (with status and Manage, or Upload due) and Available (Connect).
- **Marketplace** (`management-marketplace`): Everything, Forms, Reports, Documents, Apps; sections for the vertical, partner apps and Corelith add-ons; each with who makes it, its price and Add. Anything added opens in the same builder.
- **Vane** (`management-vane`): What it watches (switch per product or module; pay and personal details off), What it does (raise issues, plans, draft and match; "Send, pay, save or change" is fixed at Always asks), When it works (working now, quiet hours, who hears about what), This month (jobs used of the allowance). The one place Claude is named: "Vane runs on Claude, made by Anthropic. Anthropic does not train its models on your data."
- Switches in Management use ink, not the accent, so the page keeps one accent use.
- Prices and the allowance are placeholders (`open.md`).
