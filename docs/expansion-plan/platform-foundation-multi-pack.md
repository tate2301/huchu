# Platform Foundation: Multi-Pack Enablement (Implementation Contract)

## Normative References
1. Platform architecture source of truth: `docs/expansion-plan/platform-holy-grail.md`
2. UX enforcement source of truth: `docs/ux/platform-ux-playbook.md`

## 1. Goal
Establish the shared platform capabilities required to ship `Schools`, `Car Sales`, and `Thrift` packs safely in one runtime.

Success conditions:
1. Entitlements are deterministic and auditable.
2. All routes/APIs are feature-gated and tenant-scoped.
3. Shared API/data conventions are enforced consistently.
4. Accounting integration events are reliable and recoverable.

## 2. Foundation Components
1. Feature catalog and bundle registry.
2. Route registry and gate enforcement middleware.
3. Role-action authorization layer.
4. Shared request validation and response contracts.
5. Outbox-based accounting integration event pipeline.
6. Observability and operational guardrails.

## 3. Feature Catalog and Entitlement Resolution
### 3.1 Canonical Feature Keys
Naming contract:
1. `schools.<area>.<capability>`
2. `car-sales.<area>.<capability>`
3. `thrift.<area>.<capability>`

Mandatory base keys:
1. `schools.home`, `car-sales.home`, `thrift.home`
2. module keys per route family (students, results, deals, intake, etc.)
3. portal keys for Schools (`schools.portal.parent`, `schools.portal.student`, `schools.portal.teacher`)

### 3.2 Entitlement Resolution Order
1. Load `CompanySubscriptionAddon` active bundles for `companyId`.
2. Expand bundle membership via `FeatureBundleItem`.
3. Apply `CompanyFeatureFlag` overrides.
4. Return final `isEnabled` + `source` metadata.

### 3.3 Platform Tables (Field Sketch + Relations)
| Table | Field Sketch | Constraints | Relations |
| --- | --- | --- | --- |
| `PlatformFeature` | `id uuid`, `featureKey string`, `domain enum`, `name`, `description`, `defaultEnabled bool`, `isBillable bool`, `metadataJson json`, `createdAt`, `updatedAt` | unique(`featureKey`) | parent of `FeatureBundleItem`, `CompanyFeatureFlag` |
| `FeatureBundle` | `id`, `bundleCode`, `name`, `status enum(ACTIVE,INACTIVE)`, `version int`, `createdAt`, `updatedAt` | unique(`bundleCode`) | parent of `FeatureBundleItem`, referenced by `CompanySubscriptionAddon` |
| `FeatureBundleItem` | `id`, `bundleId`, `featureId`, `isRequired bool`, `createdAt` | unique(`bundleId`,`featureId`) | many-to-one bundle and feature |
| `CompanySubscriptionAddon` | `id`, `companyId`, `bundleId`, `status enum(TRIAL,ACTIVE,SUSPENDED,CANCELED)`, `startsAt`, `endsAt`, `createdByUserId` | index(`companyId`,`status`) | activates pack bundles |
| `CompanyFeatureFlag` | `id`, `companyId`, `featureId`, `isEnabled`, `source enum(DEFAULT,BUNDLE,OVERRIDE)`, `reason`, `updatedByUserId` | unique(`companyId`,`featureId`) | final per-feature override |
| `RouteFeatureMap` (recommended) | `id`, `scope enum(PAGE,API)`, `prefix`, `featureKey`, `priority`, `isActive` | unique(`scope`,`prefix`) | generated into runtime registry |

## 4. Route Registry and Gate Enforcement
### 4.1 Route Registry Contract
1. Most specific prefix must be evaluated first.
2. `scope=PAGE` and `scope=API` maps are maintained separately.
3. Any new `app/<route>` or `app/api/<route>` path requires registry mapping in same PR.

### 4.2 Feature-Gating Matrix by Route
| Scope | Prefix | Feature Key | Role Layer |
| --- | --- | --- | --- |
| Page | `/schools` | `schools.home` | admin/teacher/registrar |
| Page | `/schools/students` | `schools.students.manage` | admin/registrar |
| Page | `/schools/boarding` | `schools.boarding.manage` | warden/admin |
| Page | `/schools/results` | `schools.results.publish` | teacher/hod/admin (action constrained) |
| Page | `/schools/portal/parent` | `schools.portal.parent` | parent |
| Page | `/schools/portal/student` | `schools.portal.student` | student |
| Page | `/schools/portal/teacher` | `schools.portal.teacher` | teacher |
| API | `/api/schools/students` | `schools.students.manage` | admin/registrar |
| API | `/api/schools/boarding` | `schools.boarding.manage` | warden/admin |
| API | `/api/schools/results` | `schools.results.publish` or `schools.results.moderate` | role + state checks |
| Page | `/car-sales` | `car-sales.home` | sales-manager/agent |
| Page | `/car-sales/leads` | `car-sales.leads.manage` | sales-agent/manager |
| Page | `/car-sales/inventory` | `car-sales.inventory.manage` | inventory-clerk/manager |
| API | `/api/car-sales/deals` | `car-sales.deals.manage` | sales-agent/manager |
| API | `/api/car-sales/payments` | `car-sales.payments.manage` | cashier/finance |
| Page | `/thrift` | `thrift.home` | thrift-manager/clerk |
| Page | `/thrift/intake` | `thrift.intake.manage` | intake-clerk/manager |
| Page | `/thrift/grading` | `thrift.grading.manage` | grader/manager |
| API | `/api/thrift/lots` | `thrift.inventory.manage` | store-clerk/manager |
| API | `/api/thrift/sales` | `thrift.sales.manage` | cashier/sales-clerk |

### 4.3 Gate Failure Behavior
1. Page requests: redirect to `403` page with `requestId`.
2. API requests: `403` JSON with `FEATURE_NOT_ENABLED` or `ACTION_NOT_ALLOWED`.
3. All denials are logged with route, feature key, actor role, and tenant.

## 5. Shared Authorization Model
Authorization order per request:
1. `validateSession` -> actor identity + `companyId`.
2. `featureGate(routeFeatureKey, companyId)`.
3. `authorizeAction(role, resource, action)`.
4. `assertTenantOwnership(entity.companyId === session.companyId)`.
5. `assertStateTransition(fromStatus,toStatus,action)`.

Role-action examples:
1. Teacher can submit results but cannot publish.
2. Parent can view linked child records only.
3. Cashier can post payment but cannot void without finance role.

## 6. Shared API Contract
### 6.1 List/Query Contract
Supported query params for list routes:
1. `search`
2. `page`
3. `pageSize`
4. `sortBy`
5. `sortDir`
6. optional structured filters (`status`, `dateFrom`, `dateTo`, etc.)

### 6.2 Request/Response Examples
List response:
```json
{
  "ok": true,
  "data": {
    "items": [
      {
        "id": "uuid",
        "status": "ACTIVE",
        "createdAt": "2026-02-27T10:00:00Z"
      }
    ]
  },
  "meta": {
    "page": 1,
    "pageSize": 25,
    "total": 1,
    "requestId": "req_01J..."
  }
}
```

Validation error response:
```json
{
  "ok": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Input failed validation.",
    "details": {
      "fieldErrors": {
        "dueDate": ["dueDate must be on or after issueDate"]
      }
    }
  },
  "meta": {
    "requestId": "req_01J..."
  }
}
```

### 6.3 Deterministic Error Codes (Baseline)
1. `UNAUTHENTICATED`
2. `FEATURE_NOT_ENABLED`
3. `ACTION_NOT_ALLOWED`
4. `TENANT_SCOPE_VIOLATION`
5. `INVALID_STATE_TRANSITION`
6. `VALIDATION_ERROR`
7. `CONFLICT_DUPLICATE_KEY`

## 7. Shared Data Modeling Rules
Mandatory fields on every new pack table:
1. `id` UUID
2. `companyId` UUID (not nullable)
3. `createdAt`, `updatedAt`
4. `status` (or equivalent lifecycle column)

Mandatory index patterns:
1. index(`companyId`,`status`)
2. index(`companyId`,`createdAt desc`)
3. route-specific hot-query indexes (date and foreign key driven)

Mandatory relation and integrity rules:
1. Foreign keys across pack entities must stay within same `companyId`.
2. Business uniqueness must be tenant-qualified (for example unique(`companyId`,`invoiceNo`)).
3. Soft-delete is allowed only with explicit `deletedAt` semantics and query guard updates.

## 8. Accounting Event Foundation
### 8.1 Event Table Sketch
| Table | Field Sketch | Constraints |
| --- | --- | --- |
| `AccountingIntegrationEvent` | `id`, `companyId`, `sourceModule`, `eventType`, `sourceEntityType`, `sourceEntityId`, `idempotencyKey`, `currency`, `amount`, `payloadJson`, `status enum(PENDING,PROCESSED,FAILED,DEAD_LETTER)`, `attemptCount`, `lastError`, `occurredAt`, `processedAt` | unique(`companyId`,`idempotencyKey`), index(`status`,`occurredAt`) |

### 8.2 Event Processing Guardrails
1. Producer writes event in same transaction as source state change.
2. Consumer retries with exponential backoff and bounded attempts.
3. Dead-letter records require owner assignment and resolution note.
4. Reprocessing must preserve idempotency key.

## 9. Observability and Operations
Minimum telemetry:
1. API request count, error count, p95 latency by route family.
2. Feature gate deny counts by feature key.
3. Workflow transition failures by state machine.
4. Accounting event queue depth and failed/dead-letter counts.

Required audit logs:
1. Pack enable/disable per company.
2. Result publish/unpublish actions.
3. Financial void/reversal actions.

## 10. Migration and Rollout Plan
### 10.1 Migration Sequence
1. Add/alter schema with reversible migration scripts.
2. Seed feature catalog entries and bundle membership.
3. Generate route registry snapshots and validate no gaps.
4. Backfill optional tenant pack profile records if required.

### 10.2 Rollout Sequence
1. Enable bundle for pilot tenants only.
2. Run smoke scripts for all gated route families.
3. Review metrics for 7-day pilot window.
4. Expand in cohorts and record gate decision log.

## 11. Acceptance Criteria and QA/UAT Scenarios
### 11.1 Foundation Acceptance Criteria
1. Registry coverage: 100% of new page/API routes mapped.
2. Entitlement drift: 0 unknown feature keys in production logs.
3. Tenancy: 0 successful cross-tenant read/write attempts in tests.
4. API consistency: all new endpoints return standard envelope.
5. Accounting events: 100% finance actions emit exactly one idempotent event.

### 11.2 Foundation QA Scenarios
`PLT-T01 Route gate coverage`:
1. Enumerate routes under `/schools`, `/car-sales`, `/thrift`.
2. Verify each resolves a feature key.
3. Expected: no unmapped route.

`PLT-T02 Tenant scope negative`:
1. Create entity in Company A.
2. Access same entity using Company B token.
3. Expected: `TENANT_SCOPE_VIOLATION` or not-found.

`PLT-T03 Entitlement override`:
1. Disable one feature via `CompanyFeatureFlag`.
2. Access corresponding route.
3. Expected: denied with `FEATURE_NOT_ENABLED`.

`PLT-T04 Error contract`:
1. Submit invalid payload to pack endpoint.
2. Expected: `VALIDATION_ERROR` shape with field errors.

`PLT-T05 Accounting idempotency`:
1. Replay same source event.
2. Expected: one posted outcome, duplicate ignored safely.

## 12. Risks and Mitigations (Platform Layer)
| Risk ID | Risk | Mitigation | Owner Role |
| --- | --- | --- | --- |
| PF-R1 | Route added without gate mapping | CI check to diff route tree vs registry | Platform lead |
| PF-R2 | Feature key typo causes unintended deny/open behavior | typed constants and startup validation against catalog | Backend lead |
| PF-R3 | Dead-letter events accumulate silently | alert thresholds + daily review ownership | Finance platform lead |
| PF-R4 | Role checks bypassed in one endpoint | centralized `authorizeAction` helper + static review checklist | Security lead |
| PF-R5 | Performance regression due to missing tenant indexes | migration checklist + query plan review | Data lead |

## 13. Release Readiness Checklist (Foundation)
1. `pnpm lint` and `pnpm build` pass.
2. Route registry coverage report is clean.
3. Feature/bundle sync completed with no drift.
4. Monitoring dashboards and alerts validated.
5. Rollback runbook tested (bundle disable + verification).
