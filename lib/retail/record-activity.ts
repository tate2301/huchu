import { prisma } from "@/lib/prisma";
import { activityWords, type ActivityTone } from "@/lib/retail/activity-words";
import type { RetailAction, RetailResource } from "@/lib/retail/permission-matrix";

/**
 * A record's Activity tab (W-60, 00-foundations 4.5 and 5.6.8): the audit
 * chain read back for one entity, newest first, each event in words.
 *
 * Each record type registers the read check of its record and how to tell
 * the record is this company's. A type may also name the rows that hang off
 * it (a shift's sales and cash movements), whose events are part of its
 * story; they are read by id, so the `(companyId, entityType, entityId,
 * createdAt)` index serves every query. Area specs add their types here.
 */

type Related = Array<{ entityType: string; ids: string[] }>;

export type RecordActivityType = {
  /** Reading the record itself. Activity also needs `retail.activity` `view`. */
  read: [RetailResource, RetailAction];
  exists(companyId: string, id: string): Promise<boolean>;
  related?(companyId: string, id: string): Promise<Related>;
};

const RECORD_TYPES: Record<string, RecordActivityType> = {
  RetailShift: {
    read: ["retail.cash-control", "view"],
    exists: async (companyId, id) =>
      Boolean(await prisma.retailShift.findFirst({ where: { id, companyId }, select: { id: true } })),
    related: async (companyId, id) => {
      const [sales, movements] = await Promise.all([
        prisma.retailSale.findMany({ where: { companyId, shiftId: id }, select: { id: true } }),
        prisma.retailCashMovement.findMany({ where: { companyId, shiftId: id }, select: { id: true } }),
      ]);
      return [
        { entityType: "RetailSale", ids: sales.map((row) => row.id) },
        { entityType: "RetailCashMovement", ids: movements.map((row) => row.id) },
      ];
    },
  },
  Product: {
    read: ["retail.catalog", "view"],
    exists: async (companyId, id) =>
      Boolean(await prisma.product.findFirst({ where: { id, companyId }, select: { id: true } })),
  },
  RetailStockTransfer: {
    read: ["retail.transfers", "view"],
    exists: async (companyId, id) =>
      Boolean(await prisma.retailStockTransfer.findFirst({ where: { id, companyId }, select: { id: true } })),
  },
};

export function recordActivityType(type: string): RecordActivityType | null {
  return Object.prototype.hasOwnProperty.call(RECORD_TYPES, type) ? RECORD_TYPES[type]! : null;
}

export type ActivityRow = {
  id: string;
  at: string;
  actor: { id: string | null; name: string };
  what: string;
  tone: ActivityTone;
  reason: string | null;
};

export type ActivityPage = { total: number; rows: ActivityRow[] };

/** One page of a record's events, newest first. */
export async function readRecordActivity(
  companyId: string,
  type: string,
  id: string,
  spec: RecordActivityType,
  { page, size }: { page: number; size: number },
): Promise<ActivityPage> {
  const related = (await spec.related?.(companyId, id)) ?? [];
  const where = {
    companyId,
    OR: [
      { entityType: type, entityId: id },
      ...related
        .filter((entry) => entry.ids.length > 0)
        .map((entry) => ({ entityType: entry.entityType, entityId: { in: entry.ids } })),
    ],
  };
  const [total, events] = await Promise.all([
    prisma.platformAuditEvent.count({ where }),
    prisma.platformAuditEvent.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * size,
      take: size,
      select: { id: true, createdAt: true, actor: true, eventType: true, reason: true, payloadJson: true },
    }),
  ]);

  const payloads = events.map((event) => {
    try {
      return event.payloadJson ? (JSON.parse(event.payloadJson) as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  });

  // Names the event did not carry, by the actor's id.
  const missing = [
    ...new Set(
      events
        .filter((event, index) => event.actor && !payloads[index]!.actorName)
        .map((event) => event.actor as string),
    ),
  ];
  const users = missing.length
    ? await prisma.user.findMany({ where: { id: { in: missing } }, select: { id: true, name: true } })
    : [];
  const names = new Map(users.map((user) => [user.id, user.name]));

  return {
    total,
    rows: events.map((event, index) => {
      const payload = payloads[index]!;
      const words = activityWords(event.eventType, payload);
      const carried = typeof payload.actorName === "string" && payload.actorName ? payload.actorName : null;
      const name = event.actor ? (carried ?? names.get(event.actor) ?? "Someone") : "Automatic";
      return {
        id: event.id,
        at: event.createdAt.toISOString(),
        actor: { id: event.actor, name },
        what: words.what,
        tone: words.tone,
        reason: event.reason,
      };
    }),
  };
}
