# Offline Lifecycle (Scrap Operator + Workforce Core)

Last updated: 2026-04-12

## Scope
This offline runtime currently warms and replays only the operational workflows needed for:
- Scrap metal operator workflows.
- Minimal HR workforce workflows (`employees`, `shift-groups`, `incidents`).

Intentionally excluded from warmed offline scope:
- Accounting workflows.
- Scrap settlements (`/scrap-metal/settlements`).
- HR settlement workflows (`/human-resources/payouts`).
- Workflows that require tight, real-time server coordination.

## Offline Boot Lifecycle
1. Restore connectivity state and start lifecycle in `booting`.
2. Move to `hydrating_cache` and restore tenant-scoped persisted state:
   - session bootstrap
   - bootstrap progress
   - persisted query cache
   - outbox summary
3. Transition to `ready_offline` (if offline) or `ready_online` (if online).
4. Warmup is blocked until all warmup guards are true:
   - authenticated session
   - effective tenant context
   - tenant hydration complete
   - no tenant conflict
   - device online

If the browser is reopened while offline, the app does not run warmup. It boots from persisted cache immediately.

## Reconnect Lifecycle
1. Connectivity changes to online.
2. Lifecycle moves to `ready_online`.
3. Orchestrator triggers a guarded reconnect pass:
   - warmup (`warming`) with single-flight lock
   - outbox replay (`syncing`) with single-flight lock
4. Lifecycle returns to `ready_online`.

Warmup and replay are never started while offline.

## Mutation Queue Lifecycle
1. Offline-safe mutations enqueue durable outbox entries in IndexedDB.
2. UI applies optimistic updates immediately for supported offline-safe workflows.
3. Queue entries are deduped by:
   - `tenantKey`
   - `moduleId`
   - `operation`
   - `clientRequestId`
4. Replay runs in deterministic order:
   - `syncPriority`
   - creation time
   - dependency checks (`dependsOn`)
5. Retry/backoff:
   - retryable failures wait for `nextRetryAt`.
   - blocking failures require manual action or force retry.

## Warmed Workflow Configuration
Warmup is driven by `lib/offline/workflow-catalog.ts`:
- Catalog entries define routes, query keys, module ids, audience, and warmup scope.
- `getOfflineWarmupModuleIds()` is the authoritative source used by the runtime/module registry.
- Route availability is resolved through `getOfflineRouteAvailability()`.

Non-warmed or excluded routes degrade safely through offline guard UX instead of breaking startup.

## Query Durability and Defaults
- Persisted query records now default to long-lived retention (`30 days`).
- Query client defaults use `offlineFirst` network mode for queries and mutations.
- Retries are suppressed while offline to avoid retry storms.

## Files to Know
- `components/providers/offline-provider.tsx`
- `lib/offline/workflow-catalog.ts`
- `lib/offline/lifecycle-machine.ts`
- `lib/offline/orchestration-guards.ts`
- `lib/offline/outbox.ts`
- `lib/offline/runtime.ts`
- `lib/offline/query-cache.ts`
