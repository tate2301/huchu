# @corelithzw/module-sell

The till: shifts, sales, refunds and voids, cash movements and cash-up, Z
reports, shelf pricing and listings, tender and till policy, the manager
override, ZIMRA fiscalisation of a sale, the POS portal and the offline
runtime that keeps it selling.

```
transactions.ts     the transaction engine: open and close a shift, a sale, a refund, a void, a Z report
checkout, sale-totals, tender-policy, till-*, cash-up, z-report   the domain
offline-*.ts, pos-offline-queue.ts   what the POS keeps and syncs without a network
fiscalisation.ts    a sale into the fiscal drain
pos-host.ts         which host serves the POS portal (the host's auth and proxy ask it)
permissions.ts      the retail resources and actions
components/         the retail shell, the sale detail, the POS portal, the reports
manifest.ts         id "retail"; requires books, offline, records, stock, workflow
```

Import by path: `import { createRetailSaleTransaction } from "@corelithzw/module-sell/transactions"`.

The API routes and the pages stay in the host until the Sell host composes
this module; the manifest id stays `retail`, the schema's name for it.
