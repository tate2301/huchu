import type { ActivityTone } from "@/components/management/ui";
import type { GoldCorrection, StockMovement, WorkOrder } from "@/lib/api";

/**
 * The audit event this route draws, and where each field actually comes from.
 *
 * `Audit.dc.html` is drawn against `PlatformAuditEvent` (`prisma/schema.prisma`)
 * and the field names here are that model's, deliberately — `eventType`,
 * `entityType`, `entityId`, `reason`, `payloadJson`, `eventHash`,
 * `prevEventHash`, `actor`, `createdAt`. Nothing else is invented: the model
 * has no `summary`, no `site` and no `module`, and the three that appear below
 * are marked as this route's own composition rather than passed off as
 * columns.
 *
 * The rows themselves are **not** `PlatformAuditEvent` rows. This page has
 * always assembled its log from three domain endpoints — `/api/gold/corrections`,
 * `/api/inventory/movements` and `/api/work-orders` — and that data fetching is
 * kept exactly as it was. So two of the board's fields have no source here:
 *
 *   - `eventHash` / `prevEventHash` are written by `writePlatformAuditEvent`
 *     (`lib/audit/platform.ts`) onto the audit table. None of the three
 *     endpoints returns them. They are carried as `null` and the mono hash
 *     footer draws itself the moment a source hands them over; until then it
 *     is absent rather than faked.
 *   - and therefore **nothing on this page walks `prevEventHash`**, so the
 *     board's green "Chain verified to the first event" shield is not drawn.
 *     That shield is a claim about tamper evidence, and the client has not
 *     earned it. The footer carries the pager count alone.
 *
 * `payloadJson` is a JSON *string*, as on the model, so it can be handed
 * straight to the shared `ActivityPayload`. It is composed from the source
 * row's own columns in the shape `writePlatformAuditEvent` writes — a bare
 * value, or `{ from, to }` for something that changed.
 */
export type AuditLogEvent = {
  /** Prefixed with its source table, so ids from three endpoints cannot collide. */
  id: string;
  /** `PlatformAuditEvent.createdAt`, as an ISO string. */
  createdAt: string;
  /** `PlatformAuditEvent.eventType`, composed `DOMAIN.VERB` as the model's are. */
  eventType: string;
  /** `PlatformAuditEvent.actor`. The domain rows carry a name, not an id. */
  actor: string | null;
  /** `PlatformAuditEvent.entityType` / `.entityId`. */
  entityType: string | null;
  entityId: string | null;
  /** `PlatformAuditEvent.reason`. */
  reason: string | null;
  /** `PlatformAuditEvent.payloadJson` — a JSON string, or null. */
  payloadJson: string | null;
  /** `PlatformAuditEvent.eventHash` / `.prevEventHash`. Always null here; see above. */
  eventHash: string | null;
  prevEventHash: string | null;

  /** This route's own: the sentence the row leads with. Not a model column. */
  summary: string;
  /** This route's own: which of the three registers the row came from. */
  module: AuditModule;
  /** This route's own: the site the underlying record belongs to. */
  site: string;
  /** This route's own: the chip and avatar ramp. */
  tone: ActivityTone;
};

export type AuditModule = "GOLD" | "STORES" | "MAINTENANCE";

export const MODULE_LABELS: Record<AuditModule, string> = {
  GOLD: "Gold",
  STORES: "Stores",
  MAINTENANCE: "Maintenance",
};

/**
 * The three registers, merged and sorted newest first.
 *
 * Same three sources, same sort and same "System" fallback for an unattributed
 * actor as the page has always used — only the shape each row is mapped into
 * has changed.
 */
export function buildAuditEvents(input: {
  corrections: GoldCorrection[];
  movements: StockMovement[];
  workOrders: WorkOrder[];
}): AuditLogEvent[] {
  return [
    ...input.corrections.map(goldCorrectionEvent),
    ...input.movements.map(stockMovementEvent),
    ...input.workOrders.map(workOrderEvent),
  ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * A correction is the one source that carries a genuine before/after pair, so
 * it is the one that draws the board's old-value → new-value diff.
 *
 * `beforeSnapshot` and `afterSnapshot` are typed `unknown` on `GoldCorrection`
 * because the API returns whatever the corrected entity looked like. They are
 * diffed defensively: anything that is not a pair of plain objects yields no
 * payload at all rather than a guess at its shape.
 */
function goldCorrectionEvent(row: GoldCorrection): AuditLogEvent {
  const diff = snapshotDiff(row.beforeSnapshot, row.afterSnapshot);

  return {
    id: `gold:${row.id}`,
    createdAt: row.createdAt,
    eventType: `GOLD.${row.entityType}_CORRECTED`,
    actor: row.createdBy.name,
    entityType: row.entityType,
    entityId: row.entityId,
    reason: row.reason,
    payloadJson: diff ? JSON.stringify(diff) : null,
    eventHash: null,
    prevEventHash: null,
    summary: `${sentenceCase(row.entityType)} corrected`,
    module: "GOLD",
    site: row.pour.site.name,
    // A correction is an exception to the norm, never a healthy default.
    tone: "warn",
  };
}

const MOVEMENT_VERBS: Record<string, string> = {
  RECEIPT: "Received",
  ISSUE: "Issued",
  ADJUSTMENT: "Adjusted",
  TRANSFER: "Transferred",
};

const MOVEMENT_TONES: Record<string, ActivityTone> = {
  RECEIPT: "success",
  ISSUE: "brand",
  ADJUSTMENT: "warn",
  TRANSFER: "brand",
};

function stockMovementEvent(row: StockMovement): AuditLogEvent {
  const verb = MOVEMENT_VERBS[row.movementType] ?? sentenceCase(row.movementType);

  return {
    id: `stores:${row.id}`,
    createdAt: row.createdAt,
    eventType: `STORES.${row.movementType}`,
    actor: row.approvedBy ?? row.requestedBy ?? row.issuedBy?.name ?? "System",
    entityType: "STOCK_MOVEMENT",
    entityId: row.referenceId,
    reason: row.notes ?? null,
    payloadJson: payloadOf({
      reference: row.referenceId,
      item: row.item.itemCode,
      quantity: `${row.quantity} ${row.unit}`,
      location: row.item.location.name,
      issuedTo: row.issuedTo,
    }),
    eventHash: null,
    prevEventHash: null,
    summary: `${verb} ${row.quantity} ${row.unit} of ${row.item.name}`,
    module: "STORES",
    site: row.item.site.name,
    tone: MOVEMENT_TONES[row.movementType] ?? "neutral",
  };
}

const WORK_ORDER_SUMMARIES: Record<string, string> = {
  OPEN: "Work order opened on",
  IN_PROGRESS: "Work started on",
  COMPLETED: "Work order completed on",
  CANCELLED: "Work order cancelled on",
};

const WORK_ORDER_TONES: Record<string, ActivityTone> = {
  OPEN: "neutral",
  IN_PROGRESS: "brand",
  COMPLETED: "success",
  CANCELLED: "danger",
};

function workOrderEvent(row: WorkOrder): AuditLogEvent {
  const lead =
    WORK_ORDER_SUMMARIES[row.status] ??
    `Work order ${row.status.toLowerCase().replace(/_/g, " ")} on`;

  return {
    id: `maint:${row.id}`,
    createdAt: row.createdAt,
    eventType: `MAINTENANCE.WORK_ORDER_${row.status}`,
    actor: row.technician?.name ?? "System",
    entityType: "WORK_ORDER",
    entityId: row.id,
    // The issue is why the work order exists; the model's `reason` is where
    // that belongs.
    reason: row.issue,
    payloadJson: payloadOf({
      equipment: row.equipment.equipmentCode,
      status: row.status,
      workDone: row.workDone,
      partsUsed: row.partsUsed,
      partsCost: row.partsCost,
      labourCost: row.laborCost,
    }),
    eventHash: null,
    prevEventHash: null,
    summary: `${lead} ${row.equipment.name}`,
    module: "MAINTENANCE",
    site: row.equipment.site.name,
    tone: WORK_ORDER_TONES[row.status] ?? "neutral",
  };
}

/** True when the row has something to open — a payload, a reason, or a hash. */
export function hasPayload(event: AuditLogEvent): boolean {
  return Boolean(event.payloadJson || event.reason || event.eventHash || event.prevEventHash);
}

/* ------------------------------------------------------------------ *
 * Payload composition
 * ------------------------------------------------------------------ */

/**
 * The row's own columns, in the shape `writePlatformAuditEvent` writes and
 * `ActivityPayload` parses. Empty values are dropped rather than drawn as a
 * row of em-dashes.
 */
function payloadOf(fields: Record<string, unknown>): string | null {
  const kept = Object.entries(fields).filter(
    ([, value]) => value !== null && value !== undefined && value !== "",
  );
  if (kept.length === 0) return null;
  return JSON.stringify(Object.fromEntries(kept));
}

function snapshotDiff(
  before: unknown,
  after: unknown,
): Record<string, { from: unknown; to: unknown }> | null {
  if (!isPlainObject(before) || !isPlainObject(after)) return null;

  const diff: Record<string, { from: unknown; to: unknown }> = {};
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const from = before[key];
    const to = after[key];
    if (JSON.stringify(from ?? null) === JSON.stringify(to ?? null)) continue;
    diff[key] = { from, to };
  }

  return Object.keys(diff).length > 0 ? diff : null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function sentenceCase(value: string): string {
  const words = value.toLowerCase().replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/* ------------------------------------------------------------------ *
 * Export
 * ------------------------------------------------------------------ */

const EXPORT_COLUMNS = [
  "createdAt",
  "eventType",
  "summary",
  "actor",
  "site",
  "entityType",
  "entityId",
  "reason",
  "payloadJson",
] as const;

/** The filtered log as CSV — the header's one labelled verb. */
export function toCsv(events: AuditLogEvent[]): string {
  const lines = [EXPORT_COLUMNS.join(",")];
  for (const event of events) {
    lines.push(EXPORT_COLUMNS.map((column) => csvCell(event[column])).join(","));
  }
  return lines.join("\r\n");
}

function csvCell(value: string | null): string {
  if (value === null) return "";
  return `"${value.replace(/"/g, '""')}"`;
}
