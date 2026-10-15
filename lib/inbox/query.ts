import { NotificationType, type Prisma } from "@prisma/client";

import { parseNotificationPayload } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";

import { concernKey, resolveConcerns, type Concern } from "./concern";
import {
  changesOf,
  fullTime,
  INBOX_MODULES,
  initialsOf,
  isInboxModule,
  isMention,
  MENTION_TYPES,
  moduleOf,
  NEEDS_YOU_TYPES,
  needsYou,
  secondLineFor,
  sentenceFor,
  subjectOf,
  typesForModule,
  type Change,
  type InboxModule,
  type Segment,
} from "./describe";

export type InboxView = "needs" | "mentions" | "all";

export type InboxFilters = { view: InboxView; module: InboxModule | null };

/** One row, as the bell and /activity draw it. */
export type InboxItem = {
  /** The reader's recipient row: what Mark read and the drawer take. */
  id: string;
  type: string;
  createdAt: string;
  isRead: boolean;
  module: InboxModule;
  actor: { name: string; initials: string } | null;
  sentence: Segment[];
  second: string | null;
  concern: { ref: string; fact: string | null; status: Concern["status"]; kind: Concern["kind"] } | null;
  href: string | null;
  needsYou: boolean;
  mention: boolean;
};

/** One row opened in the drawer: the record's facts, what changed, the thread, the one action. */
export type InboxDetail = InboxItem & {
  at: string;
  facts: Array<{ label: string; value: string }>;
  changes: Change[];
  thread: Concern["thread"];
  action: { label: string; href: string } | null;
};

export type InboxPage = {
  items: InboxItem[];
  nextPage: number | null;
  counts: { needs: number; unread: number };
};

export const PAGE_SIZE = 40;

export function parseInboxFilters(params: URLSearchParams): InboxFilters & { page: number; limit: number } {
  const view = params.get("view");
  const moduleParam = params.get("module");
  const page = Math.max(1, Number.parseInt(params.get("page") ?? "1", 10) || 1);
  const limit = Math.min(PAGE_SIZE, Math.max(1, Number.parseInt(params.get("limit") ?? `${PAGE_SIZE}`, 10) || PAGE_SIZE));
  return {
    view: view === "needs" || view === "mentions" ? view : "all",
    module: isInboxModule(moduleParam) ? moduleParam : null,
    page,
    limit,
  };
}

const ALL_TYPES = Object.values(NotificationType) as string[];

function notificationWhere(filters: InboxFilters): Prisma.NotificationWhereInput {
  const and: Prisma.NotificationWhereInput[] = [];
  if (filters.view === "needs") {
    and.push({
      OR: [
        { type: { in: NEEDS_YOU_TYPES as NotificationType[] } },
        { severity: "CRITICAL" },
        { payloadJson: { contains: '"needsYou":true' } },
      ],
    });
  }
  if (filters.view === "mentions") {
    and.push({ OR: [{ type: { in: MENTION_TYPES as NotificationType[] } }, { payloadJson: { contains: '"mention":true' } }] });
  }
  if (filters.module) {
    const types = typesForModule(filters.module, ALL_TYPES) as NotificationType[];
    and.push({
      OR: [
        { payloadJson: { contains: `"module":"${filters.module}"` } },
        ...(types.length
          ? [{ type: { in: types }, OR: [{ payloadJson: null }, { NOT: { payloadJson: { contains: '"module":' } } }] }]
          : []),
      ],
    });
  }
  return and.length ? { AND: and } : {};
}

type Row = {
  id: string;
  isRead: boolean;
  notification: {
    type: string;
    severity: string;
    title: string;
    summary: string;
    payloadJson: string | null;
    entityType: string | null;
    entityId: string | null;
    createdAt: Date;
  };
};

async function shape(rows: Row[], companyId: string, viewerName: string | null, detail: boolean) {
  const prepared = rows.map((row) => {
    const payload = parseNotificationPayload(row.notification.payloadJson);
    const n = { ...row.notification, payload };
    return { row, n, payload, subject: subjectOf(n) };
  });
  const concerns = await resolveConcerns(
    prisma,
    companyId,
    prepared.flatMap((entry) => (entry.subject ? [entry.subject] : [])),
    { detail },
  );

  return prepared.map(({ row, n, payload, subject }) => {
    const concern = subject ? (concerns.get(concernKey(subject)) ?? null) : null;
    const payloadActor = typeof payload?.actorName === "string" ? payload.actorName : null;
    const actorName = payloadActor ?? concern?.actorName ?? null;
    const fallbackRef = typeof payload?.label === "string" ? payload.label : null;
    const ref = concern?.ref ?? fallbackRef;
    const { segments, used } = sentenceFor({ title: n.title, summary: n.summary, actorName, refLabel: ref, type: n.type });
    const changes = changesOf(payload);
    const viewPath = typeof payload?.viewPath === "string" ? payload.viewPath : null;
    const inboxModule = concern?.module ?? moduleOf(n);
    const item: InboxItem = {
      id: row.id,
      type: n.type,
      createdAt: n.createdAt.toISOString(),
      isRead: row.isRead,
      module: inboxModule,
      actor: actorName && actorName !== viewerName ? { name: actorName, initials: initialsOf(actorName) } : null,
      sentence: segments,
      second: secondLineFor({ sentence: segments.map((s) => s.text).join(""), title: n.title, summary: n.summary, used, changes }),
      concern: concern
        ? { ref: concern.ref, fact: concern.fact, status: concern.status, kind: concern.kind }
        : fallbackRef
          ? { ref: fallbackRef, fact: null, status: null, kind: subject?.kind ?? "deal" }
          : null,
      href: concern?.href ?? viewPath,
      needsYou: needsYou(n),
      mention: isMention(n),
    };
    return { item, concern, changes, n };
  });
}

/** The reader's inbox, a page at a time, newest first. Never another person's rows. */
export async function listInbox(args: {
  userId: string;
  companyId: string;
  viewerName: string | null;
  filters: InboxFilters;
  page: number;
  limit: number;
}): Promise<InboxPage> {
  const base: Prisma.NotificationRecipientWhereInput = {
    userId: args.userId,
    isArchived: false,
    notification: { companyId: args.companyId },
  };
  const where: Prisma.NotificationRecipientWhereInput = {
    ...base,
    ...(args.filters.view === "needs" ? { isRead: false } : {}),
    notification: { companyId: args.companyId, ...notificationWhere(args.filters) },
  };

  const [rows, needs, unread] = await Promise.all([
    prisma.notificationRecipient.findMany({
      where,
      select: {
        id: true,
        isRead: true,
        notification: {
          select: { type: true, severity: true, title: true, summary: true, payloadJson: true, entityType: true, entityId: true, createdAt: true },
        },
      },
      orderBy: [{ notification: { createdAt: "desc" } }, { createdAt: "desc" }],
      skip: (args.page - 1) * args.limit,
      take: args.limit + 1,
    }),
    prisma.notificationRecipient.count({
      where: { ...base, isRead: false, notification: { companyId: args.companyId, ...notificationWhere({ view: "needs", module: null }) } },
    }),
    prisma.notificationRecipient.count({ where: { ...base, isRead: false } }),
  ]);

  const more = rows.length > args.limit;
  const shaped = await shape(rows.slice(0, args.limit), args.companyId, args.viewerName, false);
  return {
    items: shaped.map((entry) => entry.item),
    nextPage: more ? args.page + 1 : null,
    counts: { needs, unread },
  };
}

/** One of the reader's rows with everything the drawer shows. */
export async function getInboxDetail(args: {
  userId: string;
  companyId: string;
  viewerName: string | null;
  id: string;
}): Promise<InboxDetail | null> {
  const row = await prisma.notificationRecipient.findFirst({
    where: { id: args.id, userId: args.userId, notification: { companyId: args.companyId } },
    select: {
      id: true,
      isRead: true,
      notification: {
        select: { type: true, severity: true, title: true, summary: true, payloadJson: true, entityType: true, entityId: true, createdAt: true },
      },
    },
  });
  if (!row) return null;
  const [entry] = await shape([row], args.companyId, args.viewerName, true);
  if (!entry) return null;

  // An approval's own record of the move, when the notice has no changes of its own.
  let changes = entry.changes;
  if (changes.length === 0 && row.notification.entityId && row.notification.type.startsWith("HR_")) {
    const step = await prisma.approvalAction.findFirst({
      where: { companyId: args.companyId, entityId: row.notification.entityId },
      orderBy: { actedAt: "desc" },
      select: { fromStatus: true, toStatus: true },
    });
    if (step?.toStatus) {
      const word = (status: string | null) => (status ? status.charAt(0) + status.slice(1).toLowerCase().replace(/_/g, " ") : null);
      changes = [{ label: "Status", from: word(step.fromStatus), to: word(step.toStatus) }];
    }
  }

  const href = entry.item.href;
  const label = entry.concern?.open ?? (href ? `Open in ${INBOX_MODULES[entry.item.module].label}` : null);
  return {
    ...entry.item,
    at: fullTime(entry.item.createdAt),
    facts: entry.concern?.facts ?? [],
    changes,
    thread: entry.concern?.thread ?? [],
    action: href && label ? { label, href } : null,
  };
}
