# @corelithzw/module-gold

The mine: gold receipts, pours, dispatches, purchases and prices; the crews'
settlements; plant and shift operations; the executive dashboard.

```
gold/            the gold books: receipts, pours, dispatches, purchases, prices, valuation, search, payouts
settlements/     what a crew is owed and paid
operations/      shifts, plant, downtime, the search arm
dashboard/       the executive summary
commodity-billing.ts
routes.ts, types.ts   the gold screens' routes and shared shapes
api-client.ts    the browser's client
components/      the gold and dashboard screens
manifest.ts      id "gold"; requires people, books, records, workflow, documents, notifications
api/             the route handlers, on the paths a host serves them at
pages/           the pages and layouts, on the paths a host serves them at
```

Composed only into the enterprise host; never into a marketed product.
