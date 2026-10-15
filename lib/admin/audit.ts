import type { Prisma } from "@prisma/client";

import { readActivity, type ActivityItem } from "@/lib/admin/activity";
import { LOGIN_SUCCESS_EVENT } from "@/lib/auth-core/last-sign-in";
import { operatorActor } from "@/lib/operators/audit";
import { prisma } from "@/lib/prisma";

/**
 * The audit log's views. Each tab is a question someone asks of it: what did
 * Corelith staff do, who signed in as whom, what happened to money, who
 * signed in. A row can answer more than one.
 */
export const AUDIT_TABS = {
  staff: { label: "Corelith staff", has: (item: ActivityItem) => item.actor.kind === "operator" },
  "sign-in-as": { label: "Sign in as", has: (item: ActivityItem) => item.eventType.startsWith("operator.sign_in_as.") },
  money: {
    label: "Money",
    has: (item: ActivityItem) => item.eventType.startsWith("billing.") || item.eventType.startsWith("operator.billing."),
  },
  "sign-ins": { label: "Sign-ins", has: (item: ActivityItem) => item.eventType === LOGIN_SUCCESS_EVENT },
} satisfies Record<string, { label: string; has: (item: ActivityItem) => boolean }>;

export type AuditTab = keyof typeof AUDIT_TABS;

/** The tabs a row belongs to, as one string of their keys: "staff money". */
export function auditTopics(item: ActivityItem): string {
  return (Object.keys(AUDIT_TABS) as AuditTab[]).filter((tab) => AUDIT_TABS[tab].has(item)).join(" ");
}

/** The most lines the log reads at once, newest first; a period or a filter narrows it further. */
export const AUDIT_CAP = 5000;

export type AuditQuery = {
  /** One workspace's chain; `null` for the portal's own lines only. */
  companyId?: string | null;
  createdAt?: { gte?: Date; lt?: Date };
  eventType?: string;
  operatorId?: string;
};

/** The log's lines for a question, worded, with the workspace each belongs to. */
export async function readAuditLog(query: AuditQuery, take = AUDIT_CAP) {
  const where: Prisma.PlatformAuditEventWhereInput = {
    ...(query.companyId !== undefined ? { companyId: query.companyId } : {}),
    ...(query.createdAt ? { createdAt: query.createdAt } : {}),
    ...(query.eventType ? { eventType: query.eventType } : {}),
    ...(query.operatorId ? { actor: operatorActor(query.operatorId) } : {}),
  };
  const items = await readActivity(where, { take });
  const companyIds = [...new Set(items.flatMap((item) => (item.companyId ? [item.companyId] : [])))];
  const companies = companyIds.length
    ? await prisma.company.findMany({ where: { id: { in: companyIds } }, select: { id: true, slug: true, name: true } })
    : [];
  const byId = new Map(companies.map((company) => [company.id, { slug: company.slug, name: company.name }]));
  return items.map((item) => ({ ...item, workspace: item.companyId ? (byId.get(item.companyId) ?? null) : null }));
}

/** Every kind of line the log holds, for the Event filter. */
export async function auditEventTypes() {
  const rows = await prisma.platformAuditEvent.groupBy({ by: ["eventType"], orderBy: { eventType: "asc" } });
  return rows.map((row) => row.eventType);
}
