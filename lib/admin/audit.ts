import type { Prisma } from "@prisma/client";

import { readActivity } from "@/lib/admin/activity";
import { LOGIN_SUCCESS_EVENT } from "@/lib/auth-core/last-sign-in";
import { prisma } from "@/lib/prisma";

/**
 * The audit log's views. Each tab is a question someone asks of it: what did
 * Corelith staff do, who signed in as whom, what happened to money, who
 * signed in.
 */
export const AUDIT_TABS = {
  staff: { label: "Corelith staff", where: { actor: { startsWith: "operator:" } } },
  "sign-in-as": { label: "Sign in as", where: { eventType: { startsWith: "operator.sign_in_as." } } },
  money: {
    label: "Money",
    where: { OR: [{ eventType: { startsWith: "billing." } }, { eventType: { startsWith: "operator.billing." } }] },
  },
  "sign-ins": { label: "Sign-ins", where: { eventType: LOGIN_SUCCESS_EVENT } },
} satisfies Record<string, { label: string; where: Prisma.PlatformAuditEventWhereInput }>;

export type AuditTab = keyof typeof AUDIT_TABS;

const PAGE = 50;

export async function auditPage(input: { companyId?: string; tab?: string | null; before?: string | null }) {
  const tab = input.tab && input.tab in AUDIT_TABS ? (input.tab as AuditTab) : null;
  const before = input.before ? new Date(input.before) : undefined;
  const where: Prisma.PlatformAuditEventWhereInput = {
    ...(input.companyId ? { companyId: input.companyId } : {}),
    ...(tab ? AUDIT_TABS[tab].where : {}),
  };
  const items = await readActivity(where, { take: PAGE + 1, before: before && !Number.isNaN(before.getTime()) ? before : undefined });
  const page = items.slice(0, PAGE);
  const companyIds = [...new Set(page.flatMap((item) => (item.companyId ? [item.companyId] : [])))];
  const companies = companyIds.length
    ? await prisma.company.findMany({ where: { id: { in: companyIds } }, select: { id: true, slug: true, name: true } })
    : [];
  const byId = new Map(companies.map((company) => [company.id, { slug: company.slug, name: company.name }]));
  return {
    rows: page.map((item) => ({ ...item, workspace: item.companyId ? (byId.get(item.companyId) ?? null) : null })),
    olderBefore: items.length > PAGE ? page[page.length - 1].at.toISOString() : null,
  };
}
