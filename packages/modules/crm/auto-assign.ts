/**
 * Choosing an owner for a new lead, against the live database.
 *
 * Kept apart from `assignment.ts` so the rule itself stays pure and testable:
 * this file only gathers the numbers the rule needs.
 */
import { prisma } from "@corelithzw/db/client";
import { CRM_ROLES } from "./scope";
import { pickAssignee, type AssignmentDecision, type AssignmentStrategy } from "./assignment";

/**
 * Pick the owner for a new lead in this company.
 *
 * A lead with nobody on it is a lead nobody works, so the default is to spread
 * it across whoever is active rather than leaving the field empty.
 */
export async function autoAssignLead(
  companyId: string,
  options: { strategy?: AssignmentStrategy } = {},
): Promise<AssignmentDecision> {
  const users = await prisma.user.findMany({
    where: { companyId, isActive: true, role: { in: CRM_ROLES } },
    select: { id: true, name: true },
  });
  if (users.length === 0) return { userId: null, reason: "No sales users to assign to" };

  // One grouped count rather than a query per person.
  const load = await prisma.crmLead.groupBy({
    by: ["assignedToId"],
    where: {
      companyId,
      assignedToId: { in: users.map((user) => user.id) },
      // Archived, not merely unconverted: a lead somebody put away by hand is
      // as much off their plate as one that became a deal, and counting it as
      // load sends the next enquiry to whoever tidied up least.
      archivedAt: null,
      stage: { notIn: ["WON", "LOST"] },
    },
    _count: { _all: true },
  });
  const openByUser = new Map(load.map((row) => [row.assignedToId, row._count._all]));

  const lastLead = await prisma.crmLead.findFirst({
    where: { companyId, assignedToId: { not: null } },
    orderBy: { createdAt: "desc" },
    select: { assignedToId: true },
  });

  return pickAssignee(
    users.map((user) => ({
      id: user.id,
      name: user.name,
      openLeads: openByUser.get(user.id) ?? 0,
    })),
    { strategy: options.strategy, lastAssignedId: lastLead?.assignedToId ?? null },
  );
}
