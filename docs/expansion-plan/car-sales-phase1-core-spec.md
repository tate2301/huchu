# Car Sales Phase 1 Core Spec (Delivered Slice)

## Normative References
1. `docs/expansion-plan/platform-holy-grail.md`
2. `docs/ux/platform-ux-playbook.md`
3. `docs/expansion-plan/car-sales-pack-spec.md`
4. `docs/expansion-plan/erp-expansion-master-plan.md`

## Intent
Phase 1 establishes the first production-ready Car Sales operational core: lead pipeline, vehicle inventory, deals, and payment posting with tenant-safe APIs and playbook-compliant module UI.

## Scope Delivered
1. Core car-sales data model:
- `CarSalesLead`
- `CarSalesVehicle`
- `CarSalesDeal`
- `CarSalesPayment`
2. Core car-sales enums for lead, vehicle, deal, and payment statuses/methods.
3. Deterministic ID reservation support for:
- `CAR_SALES_LEAD`
- `CAR_SALES_VEHICLE`
- `CAR_SALES_DEAL`
- `CAR_SALES_PAYMENT`
4. Autos/car-sales v2 API implementation:
- summary dashboard endpoint
- leads list/create
- inventory list/create
- deals list/create
- deal reserve transition
- deal contract transition
- payments list/create (via financing route)
5. `/api/v2/car-sales/*` alias routes mapped to autos v2 handlers for route consistency.
6. Car Sales UI replacement for scaffold:
- `/car-sales` now renders operational dashboards and tables
- one-table-per-active-view pattern across Leads, Inventory, Deals
7. Feature-gate compatibility maintained through existing autos/car-sales route registry mappings.

## APIs Delivered
1. `GET /api/v2/autos`
2. `GET|POST /api/v2/autos/leads`
3. `GET|POST /api/v2/autos/inventory`
4. `GET|POST /api/v2/autos/deals`
5. `POST /api/v2/autos/deals/:id/reserve`
6. `POST /api/v2/autos/deals/:id/contract`
7. `GET|POST /api/v2/autos/financing`
8. `GET /api/v2/car-sales`
9. `GET|POST /api/v2/car-sales/leads`
10. `GET|POST /api/v2/car-sales/inventory`
11. `GET|POST /api/v2/car-sales/deals`
12. `POST /api/v2/car-sales/deals/:id/reserve`
13. `POST /api/v2/car-sales/deals/:id/contract`
14. `GET|POST /api/v2/car-sales/financing`

## Guardrails Enforced
1. All car-sales entities and queries are hard-partitioned by `companyId`.
2. Vehicle uniqueness constraints enforced by `stockNo` and `vin` per tenant.
3. Active-deal collision guard prevents concurrent reserved/contracted delivery-active deals on one vehicle.
4. Reserve transition requires future `reservedUntil` and sets vehicle status.
5. Contract transition updates lead outcome and vehicle status.
6. Payment posting blocks overpayment and updates deal balances deterministically.

## UI Outputs
1. `/car-sales`:
- summary cards (leads, stock, active deals, contracted, payments, pipeline net)
- `VerticalDataViews` with:
  - Lead Pipeline table
  - Vehicle Inventory table
  - Deals table
2. `/car-sales/leads`, `/car-sales/inventory`, `/car-sales/deals`, `/car-sales/financing` route stubs redirect to `/car-sales` while preserving gated route compatibility.

## Remaining Car Sales Gaps After Phase 1
1. Customer/KYC dedicated entity and APIs are not yet separated from lead/deal customer fields.
2. Delivery workflow object/checklist and completed handover state machine remain pending.
3. Trade-in valuation lifecycle is pending.
4. Accounting integration events for contract/payment/delivery source actions are pending.
