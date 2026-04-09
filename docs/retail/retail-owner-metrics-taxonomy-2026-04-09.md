# Retail Owner Metrics Taxonomy

Date: 2026-04-09

## Purpose
Define how retail owner metrics (`gross profit`, `EBITDA`, `net profit`) are classified from accounting journals in a predictable, tenant-safe way.

Implemented in:
- `app/api/v2/retail/route.ts`

## Classification Strategy
The API uses a two-layer strategy:

1. **Posting-rule account mapping (primary)**
- Read active posting rules for:
  - `RETAIL_SALE`
  - `RETAIL_REFUND`
  - `RETAIL_GOODS_RECEIPT`
  - `SALES_INVOICE`
  - `PURCHASE_BILL`
- Build account ID sets for:
  - revenue
  - COGS
  - operating expense
  - depreciation/amortization
  - interest
  - tax expense

2. **Code/category taxonomy fallback (secondary)**
- Applied when posting-rule mapping for a bucket is missing.
- Uses account `code`, `name`, and `category` to infer the bucket.

## Default Taxonomy Families

### Revenue
- Code prefixes: `4*`
- Name/category hints: `revenue`, `sales`, `turnover`

### COGS
- Code prefixes: `500*`
- Category/name hints: `COGS`, `cost of goods`, `cost of sales`

### Operating Expense
- Code prefixes: `51*`, `52*`, `53*`, `54*`, `55*`, `56*`, `57*`, `58*`, `59*`
- Name/category hints: operations/admin/salary/wages/rent/utilities/maintenance/marketing

### Depreciation/Amortization
- Code prefixes: `580*` to `587*`
- Name hints: `depreciation`, `amortization`

### Interest
- Code prefixes: `570*` to `577*`
- Name hint: `interest`

### Tax Expense
- Code prefixes: `590*` to `597*`
- Name hints: `income tax`, `tax expense`, `corporate tax`

## KPI Construction
- `Gross Profit = Net Revenue - COGS`
- `EBITDA = Gross Profit - Operating Expense`
- `Net Profit = EBITDA - Depreciation/Amortization - Interest - Tax Expense`

## Data Quality Mode
`ownerMetrics.model` indicates the source confidence:
- `ACCOUNTING_POSTED`: posted journals available
- `ESTIMATED_FROM_OPERATIONS`: fallback estimate when journal coverage is not available

`ownerMetrics.taxonomy` exposes:
- strategy used
- whether posting rules were available
- mapped account counts per bucket

## How to Tune Per Tenant
1. Update **Posting Rules** (`/accounting/posting-rules`) for retail source types.
2. Keep **chart of accounts codes/categories** aligned with the families above.
3. Use stable account semantics:
- dedicate specific COGS ledgers
- separate depreciation and interest ledgers from generic OpEx
- keep income tax in dedicated tax-expense ledgers

This makes owner dashboards consistent and avoids metric drift across clients.
