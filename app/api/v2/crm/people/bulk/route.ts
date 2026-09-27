import { prisma } from "@/lib/prisma";
import { recordBulkHandler } from "@/lib/crm/registers/server/bulk";

/** Assign, archive or restore many people at once. See `recordBulkHandler`. */
export const POST = recordBulkHandler({
  noun: { one: "person", many: "people" },
  actions: ["assign", "archive", "restore"],
  load: (companyId, ids) =>
    prisma.crmPerson.findMany({
      where: { id: { in: ids }, companyId, mergedIntoId: null },
      select: { id: true, assignedToId: true, archivedAt: true },
    }),
  update: async (ids, data) => {
    await prisma.crmPerson.updateMany({ where: { id: { in: ids } }, data });
  },
});
