import { prisma } from "@/lib/prisma";
import { canRetailRoleDo, type RetailAction, type RetailResource } from "@/lib/retail/permission-matrix";

/**
 * Who can approve an act with their till PIN (FLR-03): active people of the
 * shop with a PIN who hold the right, managers first, then owners, each by
 * name. Every sheet with a Manager PIN reads it (`GET /api/v2/retail/approvers`).
 */
export async function listApprovers(companyId: string, can: [RetailResource, RetailAction]): Promise<Array<{ id: string; name: string }>> {
  const people = await prisma.user.findMany({
    where: { companyId, isActive: true, retailTillPin: { isNot: null } },
    select: { id: true, name: true, role: true },
  });
  const rank = (role: string) => (role === "MANAGER" ? 0 : role === "SUPERADMIN" || role === "OWNER" ? 1 : 2);
  return people
    .filter((person) => canRetailRoleDo(person.role, can[0], can[1]))
    .sort((a, b) => rank(a.role) - rank(b.role) || a.name.localeCompare(b.name))
    .map((person) => ({ id: person.id, name: person.name }));
}
