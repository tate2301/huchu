# @corelithzw/module-books

The ledger and everything that posts to it.

```
chart-of-accounts, ledger, balances, posting, closing, period-lock, ownership   the books themselves
defaults, source-types, bootstrap, tax-rules, tax-selection, vat-return         what a tenant starts with, and tax
fiscalisation, fiscal-day, fiscal-drain, fdms-*, integration*                    ZIMRA fiscalisation and the device
payment-ledger, retail-posting, listview-*, format, tab-config, visibility       the rest of the domain
api-client.ts                    the browser's client for /api/accounting
components/                      the accounting shell, hubs, list views, fiscalisation and tax screens
manifest.ts                      id "books"; requires documents, notifications
api/                             the route handlers, on the paths a host serves them at
pages/                           the pages and layouts, on the paths a host serves them at
```

Import by path: `import { createJournalEntryFromSource } from "@corelithzw/module-books/posting"`.

Two hooks the host fills from its `modules.ts`: `registerFiscalDrainIssuer`
for the receipts another module writes (the school's fee receipt), and
`onFiscalBacklog` for what happens when a tenant's receipts have been stuck
for a while (the compliance module raises an incident). Books names neither.
