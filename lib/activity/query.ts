import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

import type { ActivityLogEntry, ActivityLogFilters, ActivityLogPage } from "./api";
import {
  activityModuleLabel,
  describeAction,
  humanizeModel,
  type ActivityAction,
  type ActivityChange,
} from "./describe";

export const ACTIVITY_PAGE_SIZE = 40;

const ACTIONS: ActivityAction[] = ["created", "updated", "deleted"];

/* ---------------------------------------------------------------------- *
 * Cursor: the last row's (createdAt, id), newest first
 * ---------------------------------------------------------------------- */

function encodeCursor(row: { createdAt: Date; id: string }) {
  return Buffer.from(JSON.stringify([row.createdAt.toISOString(), row.id])).toString("base64url");
}

function decodeCursor(cursor: string | null | undefined): { createdAt: Date; id: string } | null {
  if (!cursor) return null;
  try {
    const [at, id] = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as [
      string,
      string,
    ];
    const createdAt = new Date(at);
    if (Number.isNaN(createdAt.getTime()) || typeof id !== "string") return null;
    return { createdAt, id };
  } catch {
    return null;
  }
}

/* ---------------------------------------------------------------------- *
 * Filters
 * ---------------------------------------------------------------------- */

export function parseActivityFilters(params: URLSearchParams): ActivityLogFilters {
  const read = (key: string) => params.get(key)?.trim() || undefined;
  const action = read("action");
  return {
    actorId: read("actorId"),
    module: read("module"),
    action: ACTIONS.includes(action as ActivityAction) ? (action as ActivityAction) : undefined,
    from: read("from"),
    to: read("to"),
    q: read("q"),
    entityType: read("entityType"),
    entityId: read("entityId"),
  };
}

function validDate(value: string | undefined) {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

async function buildWhere(
  companyId: string,
  filters: ActivityLogFilters,
): Promise<Prisma.PlatformAuditEventWhereInput> {
  const and: Prisma.PlatformAuditEventWhereInput[] = [{ companyId }];

  if (filters.actorId) {
    // Auth events name their actor by email; everything else by id.
    const user = await prisma.user.findFirst({
      where: { id: filters.actorId, companyId },
      select: { email: true },
    });
    and.push({
      actor: { in: user?.email ? [filters.actorId, user.email] : [filters.actorId] },
    });
  }

  if (filters.module) {
    and.push({
      OR: [
        // Activity events: `module` is the payload's first key.
        { payloadJson: { startsWith: `{"module":${JSON.stringify(filters.module)}` } },
        // A module's own audit events, e.g. `schools.fee.invoice.written-off`.
        { eventType: { startsWith: `${filters.module}.`, mode: "insensitive" } },
      ],
    });
  }

  if (filters.action) {
    and.push({ eventType: { endsWith: `.${filters.action}`, mode: "insensitive" } });
  }

  const from = validDate(filters.from);
  const to = validDate(filters.to);
  if (from || to) {
    and.push({ createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) } });
  }

  if (filters.q) {
    and.push({
      OR: [
        { payloadJson: { contains: filters.q, mode: "insensitive" } },
        { eventType: { contains: filters.q, mode: "insensitive" } },
        { entityType: { contains: filters.q, mode: "insensitive" } },
        { reason: { contains: filters.q, mode: "insensitive" } },
      ],
    });
  }

  if (filters.entityId) {
    and.push({
      OR: [
        { entityId: filters.entityId, ...(filters.entityType ? { entityType: filters.entityType } : {}) },
        { payloadJson: { contains: `"recordId":${JSON.stringify(filters.entityId)}` } },
      ],
    });
  } else if (filters.entityType) {
    and.push({ entityType: filters.entityType });
  }

  return { AND: and };
}

/* ---------------------------------------------------------------------- *
 * Rows
 * ---------------------------------------------------------------------- */

type StoredPayload = {
  module?: unknown;
  actorName?: unknown;
  label?: unknown;
  changes?: unknown;
  more?: unknown;
  message?: unknown;
  summary?: unknown;
  name?: unknown;
};

function parsePayload(json: string | null): StoredPayload {
  if (!json) return {};
  try {
    const value = JSON.parse(json) as unknown;
    return typeof value === "object" && value !== null ? (value as StoredPayload) : {};
  } catch {
    return {};
  }
}

const text = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null);

function actionOf(eventType: string): ActivityAction | null {
  const verb = eventType.split(".").pop()?.toLowerCase();
  return ACTIONS.includes(verb as ActivityAction) ? (verb as ActivityAction) : null;
}

/** `schools.fee.invoice.written-off` → `Fee invoice written off`, dropping a leading module. */
function humanizeEventType(eventType: string, module: string | null): string {
  const parts = eventType.split(".").filter(Boolean);
  if (parts.length > 1 && module && parts[0]!.toLowerCase() === module) parts.shift();
  const words = parts.join(" ").replace(/[_-]+/g, " ").toLowerCase().trim();
  return words ? words[0]!.toUpperCase() + words.slice(1) : eventType;
}

function moduleOf(eventType: string, payload: StoredPayload): string | null {
  const stored = text(payload.module);
  if (stored) return stored;
  const prefix = eventType.split(".")[0] ?? "";
  // Only a lower-case prefix names a module (`schools.…`); `USER.LOGIN` does not.
  return prefix && prefix === prefix.toLowerCase() && eventType.includes(".") ? prefix : null;
}

/**
 * One page of a company's log, newest first.
 *
 * Keyset-paged on `(createdAt, id)`, which the `[companyId, createdAt]` index
 * serves directly: page forty costs what page one does, and a row written while
 * somebody scrolls cannot shift what the next page returns.
 */
export async function listActivity(args: {
  companyId: string;
  filters: ActivityLogFilters;
  cursor?: string | null;
  limit?: number;
}): Promise<ActivityLogPage> {
  const limit = args.limit ?? ACTIVITY_PAGE_SIZE;
  const where = await buildWhere(args.companyId, args.filters);
  const after = decodeCursor(args.cursor);
  if (after) {
    where.AND = [
      ...(Array.isArray(where.AND) ? where.AND : []),
      {
        OR: [
          { createdAt: { lt: after.createdAt } },
          { createdAt: after.createdAt, id: { lt: after.id } },
        ],
      },
    ];
  }

  const rows = await prisma.platformAuditEvent.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    select: {
      id: true,
      createdAt: true,
      actor: true,
      eventType: true,
      entityType: true,
      entityId: true,
      reason: true,
      payloadJson: true,
    },
  });

  const page = rows.slice(0, limit);
  const actorKeys = [...new Set(page.map((row) => row.actor).filter((a): a is string => !!a))];
  const users = actorKeys.length
    ? await prisma.user.findMany({
        where: {
          companyId: args.companyId,
          OR: [{ id: { in: actorKeys } }, { email: { in: actorKeys } }],
        },
        select: { id: true, name: true, email: true },
      })
    : [];
  const userByKey = new Map<string, (typeof users)[number]>();
  for (const user of users) {
    userByKey.set(user.id, user);
    if (user.email) userByKey.set(user.email, user);
  }

  const entries: ActivityLogEntry[] = page.map((row) => {
    const payload = parsePayload(row.payloadJson);
    const moduleKey = moduleOf(row.eventType, payload);
    const action = actionOf(row.eventType);
    const changes = Array.isArray(payload.changes) ? (payload.changes as ActivityChange[]) : [];
    const isActivity = changes.length > 0 && !!row.entityType;
    const user = row.actor ? userByKey.get(row.actor) : undefined;

    return {
      id: row.id,
      createdAt: row.createdAt.toISOString(),
      eventType: row.eventType,
      action,
      module: moduleKey,
      moduleLabel: moduleKey ? activityModuleLabel(moduleKey) : null,
      summary:
        isActivity && action
          ? `${describeAction(action)} ${humanizeModel(row.entityType!).toLowerCase()}`
          : text(payload.summary) ?? text(payload.message) ?? humanizeEventType(row.eventType, moduleKey),
      recordLabel: text(payload.label) ?? text(payload.name),
      entityType: row.entityType,
      entityId: row.entityId,
      actor: row.actor
        ? {
            id: user?.id ?? null,
            name: user?.name ?? text(payload.actorName) ?? user?.email ?? row.actor,
            email: user?.email ?? null,
          }
        : null,
      changes,
      more: typeof payload.more === "number" ? payload.more : 0,
      reason: row.reason,
    };
  });

  return {
    entries,
    nextCursor: rows.length > limit ? encodeCursor(page[page.length - 1]!) : null,
  };
}
