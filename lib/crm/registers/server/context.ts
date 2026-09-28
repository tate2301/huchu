import { CRM_CAPABILITIES, capabilityCheckFor } from "@/lib/crm/permissions";
import { prisma } from "@/lib/prisma";

import { safeTimeZone } from "../dates";
import type { RegisterContext } from "./types";

/** The context for somebody signed in now. */
export async function registerContext(
  user: { id: string; role: string; companyId: string },
  tz?: string | null,
  now: Date = new Date(),
): Promise<RegisterContext> {
  const can = await capabilityCheckFor(user, CRM_CAPABILITIES);
  return { companyId: user.companyId, userId: user.id, role: user.role, now, tz: safeTimeZone(tz), can };
}

/**
 * The same context, rebuilt for a job that runs after its requester asked.
 * Null when that person is gone, switched off, or not in this company — the
 * job then fails rather than exporting as nobody.
 */
export async function registerContextFor(params: {
  companyId: string;
  userId: string;
  tz?: string | null;
  now?: Date;
}): Promise<RegisterContext | null> {
  const user = await prisma.user.findFirst({
    where: { id: params.userId, companyId: params.companyId, isActive: true },
    select: { id: true, role: true, companyId: true },
  });
  if (!user?.companyId) return null;
  return registerContext({ id: user.id, role: user.role, companyId: user.companyId }, params.tz, params.now);
}
