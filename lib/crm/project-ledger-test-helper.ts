/**
 * Test-only: spend on a project as the ledger holds it (books-final §5.3), a
 * posted journal of `amount` on an expense account against cash, on the
 * project's cost centre. A project's cost is read from these lines.
 */
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

async function account(companyId: string, code: string, name: string, type: "EXPENSE" | "ASSET") {
  return prisma.chartOfAccount.upsert({
    where: { companyId_code: { companyId, code } },
    update: {},
    create: { companyId, code, name, type },
    select: { id: true },
  });
}

export async function spendOnProject(companyId: string, projectId: string, amount: number | string, createdById: string) {
  const project = await prisma.crmProject.findUniqueOrThrow({ where: { id: projectId }, select: { costCenterId: true } });
  const [expense, cash] = await Promise.all([account(companyId, "5530", "Site Materials", "EXPENSE"), account(companyId, "1005", "Cash Vault", "ASSET")]);
  const highest = await prisma.journalEntry.aggregate({ where: { companyId }, _max: { entryNumber: true } });
  const value = new Prisma.Decimal(amount).toNumber();
  return prisma.journalEntry.create({
    data: {
      companyId,
      entryNumber: (highest._max.entryNumber ?? 0) + 1,
      entryDate: new Date(),
      description: "Spend on the project",
      status: "POSTED",
      sourceType: "PETTY_CASH_VOUCHER",
      createdById,
      lines: {
        create: [
          { accountId: expense.id, debit: value, credit: 0, costCenterId: project.costCenterId },
          { accountId: cash.id, debit: 0, credit: value, costCenterId: project.costCenterId },
        ],
      },
    },
  });
}

export async function clearProjectLedger(companyId: string) {
  await prisma.journalLine.deleteMany({ where: { entry: { companyId } } });
  await prisma.journalEntry.deleteMany({ where: { companyId } });
}
