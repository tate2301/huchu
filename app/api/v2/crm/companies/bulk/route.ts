import { prisma } from "@/lib/prisma";
import { ACCOUNT_STATUS_OPTIONS } from "@/lib/crm/record-labels";
import { recordBulkHandler } from "@/lib/crm/registers/server/bulk";

/** Assign, set the account status of, archive or restore many companies at once. */
export const POST = recordBulkHandler({
  noun: { one: "company", many: "companies" },
  actions: ["assign", "status", "archive", "restore"],
  status: { field: "accountStatus", values: ACCOUNT_STATUS_OPTIONS.map((option) => option.value) },
  load: async (companyId, ids) =>
    (
      await prisma.crmClient.findMany({
        where: { id: { in: ids }, companyId, mergedIntoId: null },
        select: { id: true, assignedToId: true, archivedAt: true, accountStatus: true },
      })
    ).map(({ accountStatus, ...row }) => ({ ...row, status: accountStatus })),
  update: async (rows, { data }) => {
    await prisma.crmClient.updateMany({ where: { id: { in: rows.map((row) => row.id) } }, data });
  },
});
