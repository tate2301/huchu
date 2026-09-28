import { prisma } from "@/lib/prisma";
import { recordBulkHandler } from "@/lib/crm/registers/server/bulk";

/** Archive or restore many sites at once. A site has no owner to assign. */
export const POST = recordBulkHandler({
  noun: { one: "site", many: "sites" },
  actions: ["archive", "restore"],
  load: (companyId, ids) =>
    prisma.crmSite.findMany({
      where: { id: { in: ids }, companyId },
      select: { id: true, archivedAt: true },
    }),
  update: async (rows, { data }) => {
    await prisma.crmSite.updateMany({ where: { id: { in: rows.map((row) => row.id) } }, data });
  },
});
