import { z } from "zod";

import type { AuthenticatedSession } from "@corelithzw/platform/api-utils";
import type { CollabRecord } from "@/lib/crm/collaboration";
import { canUser, type CrmCapability } from "@/lib/crm/permissions";
import { prisma } from "@corelithzw/db/client";

export { crmLeadStageSchema } from "@/lib/crm/pipeline";

export const crmDocumentLineSchema = z.object({
  description: z.string().trim().min(1).max(300),
  quantity: z.number().finite().positive(),
  unitPrice: z.number().finite().nonnegative(),
  taxRate: z.number().finite().min(0).max(100).optional(),
});

/**
 * Whether this session holds a capability — role default, unless an admin has
 * decided otherwise for this person.
 *
 * This replaced a `requireCrmManager(session)` that asked only about the role.
 * The distinction matters because the permissions screen offers per-user
 * allow and deny for every capability in the list, and a screen that promises
 * a decision the server does not read is worse than no screen at all. Naming
 * the capability at each call site also documents which of them a route is
 * actually gated on, which "manager access required" never did.
 */
export function requireCrmCapability(
  session: AuthenticatedSession,
  capability: CrmCapability,
): Promise<boolean> {
  return canUser(session, capability);
}

/**
 * Guard against cross-tenant user references: any user id accepted from a
 * request body (assignee, default assignee, commission target) must belong to
 * the caller's company. Returns true when the id is null/undefined or valid.
 */
export async function isCompanyUser(
  companyId: string,
  userId: string | null | undefined,
): Promise<boolean> {
  if (!userId) return true;
  const user = await prisma.user.findFirst({
    where: { id: userId, companyId },
    select: { id: true },
  });
  return Boolean(user);
}

/**
 * Confirm a record a comment or follow is aimed at exists inside this tenant.
 * Without it, a caller could post a comment against another company's deal id
 * and the row would sit there unreachable but real.
 */
export async function crmRecordExists(
  companyId: string,
  record: CollabRecord,
): Promise<boolean> {
  const where = { id: record.recordId, companyId };
  switch (record.entity) {
    case "LEAD":
      return Boolean(await prisma.crmLead.findFirst({ where, select: { id: true } }));
    case "DEAL":
      return Boolean(await prisma.crmDeal.findFirst({ where, select: { id: true } }));
    case "COMPANY":
      return Boolean(await prisma.crmClient.findFirst({ where, select: { id: true } }));
    case "PERSON":
      return Boolean(await prisma.crmPerson.findFirst({ where, select: { id: true } }));
    case "SITE":
      return Boolean(await prisma.crmSite.findFirst({ where, select: { id: true } }));
    default:
      return false;
  }
}
