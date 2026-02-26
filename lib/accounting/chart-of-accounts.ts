import { prisma } from "@/lib/prisma";

export async function validateParentAccount(input: {
  companyId: string;
  parentAccountId?: string | null;
  accountType: "ASSET" | "LIABILITY" | "EQUITY" | "INCOME" | "EXPENSE";
  accountId?: string;
}) {
  if (!input.parentAccountId) {
    return { parent: null as null, hierarchyPath: null as string | null, level: 0 };
  }

  const parent = await prisma.chartOfAccount.findFirst({
    where: {
      id: input.parentAccountId,
      companyId: input.companyId,
    },
    select: {
      id: true,
      nodeType: true,
      type: true,
      hierarchyPath: true,
      level: true,
    },
  });

  if (!parent) {
    throw new Error("Parent account not found for this company.");
  }
  if (parent.nodeType !== "GROUP") {
    throw new Error("Parent account must be a GROUP account.");
  }
  if (parent.type !== input.accountType) {
    throw new Error("Parent account type must match child account type.");
  }
  if (input.accountId && parent.id === input.accountId) {
    throw new Error("An account cannot be its own parent.");
  }
  if (
    input.accountId &&
    parent.hierarchyPath &&
    parent.hierarchyPath.split("/").includes(input.accountId)
  ) {
    throw new Error("Parent selection would create a hierarchy cycle.");
  }

  const hierarchyPath = parent.hierarchyPath ? `${parent.hierarchyPath}/${parent.id}` : parent.id;
  return {
    parent,
    hierarchyPath,
    level: (parent.level ?? 0) + 1,
  };
}

export async function ensureLedgerAccountIds(companyId: string, accountIds: string[]) {
  if (accountIds.length === 0) return [];

  const accounts = await prisma.chartOfAccount.findMany({
    where: {
      companyId,
      id: { in: accountIds },
    },
    select: {
      id: true,
      nodeType: true,
      isActive: true,
    },
  });

  const accountMap = new Map(accounts.map((account) => [account.id, account]));

  return accountIds.filter((id) => {
    const account = accountMap.get(id);
    if (!account) return true;
    if (!account.isActive) return true;
    return account.nodeType !== "LEDGER";
  });
}
