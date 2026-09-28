import { prisma } from "@/lib/prisma";
import { recordBulkHandler } from "@/lib/crm/registers/server/bulk";

/**
 * Assign, archive or restore many deals at once. A stage move is not here:
 * it has rules of its own — required fields, a reason for a loss — that are
 * checked a deal at a time, on the board or the deal.
 */
export const POST = recordBulkHandler({
  noun: { one: "deal", many: "deals" },
  actions: ["assign", "archive", "restore"],
  load: (companyId, ids) =>
    prisma.crmDeal.findMany({
      where: { id: { in: ids }, companyId },
      select: { id: true, assignedToId: true, archivedAt: true },
    }),
  update: async (ids, data) => {
    await prisma.crmDeal.updateMany({ where: { id: { in: ids } }, data });
  },
});
