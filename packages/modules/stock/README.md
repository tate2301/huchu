# @corelithzw/module-stock

What the business holds, and what it sells.

```
catalogue.ts, catalogue-service.ts, catalogue-adapters.ts   products, price lists, units, resolving a price
stock-movements.ts                                          receipts, issues, transfers and the ledger they keep
api-client.ts                                               the browser's client for /api/inventory and /api/stock-locations
components/                                                 the stores shell, stock overview, movements feed, locations, catalogue and price-list panels
manifest.ts                                                 id "stock"; requires people, records, books, documents
api/                                                        the route handlers, on the paths a host serves them at
pages/                                                      the pages and layouts, on the paths a host serves them at
```

Import by path: `import { resolvePrice } from "@corelithzw/module-stock/catalogue"`.
