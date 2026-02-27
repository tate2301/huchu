# Schools Fees Phase 3 Spec (Delivered Slice)

## Normative References
1. `docs/expansion-plan/platform-holy-grail.md`
2. `docs/ux/platform-ux-playbook.md`
3. `docs/expansion-plan/schools-pack-spec.md`
4. `docs/expansion-plan/erp-expansion-master-plan.md`

## Intent
Phase 3 delivers the Schools finance spine for fee operations and exposes finance visibility in parent/student portals with strict tenant guards and deterministic accounting integration events.

## Scope Delivered
1. Fee structure lifecycle (`SchoolFeeStructure`, `SchoolFeeStructureLine`) with create/list APIs.
2. Fee invoice lifecycle (`SchoolFeeInvoice`, `SchoolFeeInvoiceLine`) with create/list and `issue`/`write-off` transitions.
3. Receipt lifecycle (`SchoolFeeReceipt`, `SchoolFeeReceiptAllocation`) with allocation validation and `void` reversal support.
4. Waiver lifecycle (`SchoolFeeWaiver`) with `apply` transition and invoice balance recomputation.
5. Fee summary dashboard API for schools pack metrics.
6. Parent and student portal fee views, including outstanding balance summary.
7. Guarded parent child-fees endpoint honoring `canReceiveFinancials`.
8. Deterministic accounting integration event emission for issue, receipt, void, waiver, and write-off flows.
9. Deterministic sequence support for fee invoice and receipt numbers.

## Backend Contract
### Routes
1. `GET /api/v2/schools/fees`
2. `GET|POST /api/v2/schools/fees/structures`
3. `GET|POST /api/v2/schools/fees/invoices`
4. `POST /api/v2/schools/fees/invoices/:id/issue`
5. `POST /api/v2/schools/fees/invoices/:id/write-off`
6. `GET|POST /api/v2/schools/fees/receipts`
7. `POST /api/v2/schools/fees/receipts/:id/void`
8. `GET|POST /api/v2/schools/fees/waivers`
9. `POST /api/v2/schools/fees/waivers/:id/apply`
10. `GET /api/v2/schools/portal/parent/children/:studentId/fees`

### Accounting Event Types
1. `SCHOOL_FEE_INVOICE_ISSUED`
2. `SCHOOL_FEE_RECEIPT_POSTED`
3. `SCHOOL_FEE_RECEIPT_VOIDED` (with `invertDirection`)
4. `SCHOOL_FEE_WAIVER_APPLIED`
5. `SCHOOL_FEE_WRITEOFF_POSTED`

Idempotency key pattern:
1. `schools:<eventType>:<sourceId>:<version>`

## Data Model Delivered
1. `SchoolFeeStructure`
2. `SchoolFeeStructureLine`
3. `SchoolFeeInvoice`
4. `SchoolFeeInvoiceLine`
5. `SchoolFeeReceipt`
6. `SchoolFeeReceiptAllocation`
7. `SchoolFeeWaiver`
8. Enum set for statuses, payment methods, and waiver types/statuses.

## UX Surface Delivered
1. Schools fees page: `/schools/fees`
2. Vertical views with one-table-per-active-view:
- Invoices
- Receipts
- Waivers
- Fee Structures
3. Schools dashboard counts include fee metrics.
4. Parent portal and student portal include:
- outstanding balance metric
- fee records tab

## Guardrails Applied
1. All fee queries and writes partition by `companyId`.
2. Receipt allocations enforce non-negative, non-over-allocation behavior.
3. Invoice balance/status refresh runs after receipt/waiver transitions.
4. Parent child-fees access is blocked when `canReceiveFinancials=false` for non-privileged actors.
5. Feature gates already mapped for `/schools/fees` and `/api/v2/schools/fees/*`.

## Residual Gaps Carried to Next Slice
1. Teacher assignment ownership model (`SchoolTeacherProfile`, `SchoolClassSubject`) for strict teacher portal action guards.
2. Publish window governance (`SchoolPublishWindow`) with results release enforcement.
3. Refund flow and reverse-waiver lifecycle.
