import { prisma } from "@/lib/prisma";
import { DEFAULT_CHART_OF_ACCOUNTS, DEFAULT_POSTING_RULES, DEFAULT_TAX_CODES } from "@/lib/accounting/defaults";

type BootstrapSummary = {
  createdAccounts: number;
  createdTaxCodes: number;
  createdPostingRules: number;
};

export async function ensureAccountingDefaults(companyId: string): Promise<BootstrapSummary> {
  await prisma.accountingSettings.upsert({
    where: { companyId },
    update: {},
    create: { companyId },
  });

  const existingAccounts = await prisma.chartOfAccount.findMany({
    where: { companyId },
    select: { id: true, code: true },
  });
  const accountCodeSet = new Set(existingAccounts.map((account) => account.code));

  const missingAccounts = DEFAULT_CHART_OF_ACCOUNTS.filter((account) => !accountCodeSet.has(account.code));
  if (missingAccounts.length > 0) {
    await prisma.chartOfAccount.createMany({
      data: missingAccounts.map((account) => ({
        companyId,
        code: account.code,
        name: account.name,
        type: account.type,
        category: account.category,
        description: account.description,
        systemManaged: account.systemManaged ?? false,
      })),
    });
  }

  const existingTaxCodes = await prisma.taxCode.findMany({
    where: { companyId },
    select: { code: true },
  });
  const taxCodeSet = new Set(existingTaxCodes.map((taxCode) => taxCode.code));
  const missingTaxCodes = DEFAULT_TAX_CODES.filter((taxCode) => !taxCodeSet.has(taxCode.code));
  if (missingTaxCodes.length > 0) {
    await prisma.taxCode.createMany({
      data: missingTaxCodes.map((taxCode) => ({
        companyId,
        code: taxCode.code,
        name: taxCode.name,
        rate: taxCode.rate,
        type: taxCode.type ?? "VAT",
        effectiveFrom: taxCode.effectiveFrom ? new Date(taxCode.effectiveFrom) : undefined,
        effectiveTo: taxCode.effectiveTo ? new Date(taxCode.effectiveTo) : undefined,
      })),
    });
  }

  const accounts = await prisma.chartOfAccount.findMany({
    where: { companyId },
    select: { id: true, code: true },
  });
  const accountByCode = new Map(accounts.map((account) => [account.code, account.id]));

  const existingRules = await prisma.postingRule.findMany({
    where: { companyId },
    select: { sourceType: true },
  });
  const ruleSourceTypeSet = new Set(existingRules.map((rule) => rule.sourceType));

  let createdPostingRules = 0;
  for (const rule of DEFAULT_POSTING_RULES) {
    if (ruleSourceTypeSet.has(rule.sourceType)) continue;

    const lines = rule.lines
      .map((line) => {
        const accountId = accountByCode.get(line.accountCode);
        if (!accountId) return null;
        return {
          accountId,
          direction: line.direction,
          basis: line.basis,
          allocationType: "PERCENT" as const,
          allocationValue: line.allocationPercent ?? 100,
        };
      })
      .filter((line): line is {
        accountId: string;
        direction: "DEBIT" | "CREDIT";
        basis: "AMOUNT" | "NET" | "TAX" | "GROSS" | "DEDUCTIONS" | "ALLOWANCES";
        allocationType: "PERCENT";
        allocationValue: number;
      } => line !== null);

    if (lines.length < 2) continue;

    await prisma.postingRule.create({
      data: {
        companyId,
        name: rule.name,
        sourceType: rule.sourceType,
        isActive: true,
        lines: {
          create: lines,
        },
      },
    });
    createdPostingRules += 1;
  }

  return {
    createdAccounts: missingAccounts.length,
    createdTaxCodes: missingTaxCodes.length,
    createdPostingRules,
  };
}
