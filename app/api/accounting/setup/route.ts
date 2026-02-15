import { NextRequest, NextResponse } from "next/server";
import { validateSession, successResponse, errorResponse } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { DEFAULT_CHART_OF_ACCOUNTS, DEFAULT_POSTING_RULES, DEFAULT_TAX_CODES } from "@/lib/accounting/defaults";

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const companyId = session.user.companyId;

    const [accountCount, taxCount, ruleCount] = await Promise.all([
      prisma.chartOfAccount.count({ where: { companyId } }),
      prisma.taxCode.count({ where: { companyId } }),
      prisma.postingRule.count({ where: { companyId } }),
    ]);

    await prisma.accountingSettings.upsert({
      where: { companyId },
      update: {},
      create: {
        companyId,
      },
    });

    if (accountCount === 0) {
      await prisma.chartOfAccount.createMany({
        data: DEFAULT_CHART_OF_ACCOUNTS.map((account) => ({
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

    if (taxCount === 0) {
      await prisma.taxCode.createMany({
        data: DEFAULT_TAX_CODES.map((tax) => ({
          companyId,
          code: tax.code,
          name: tax.name,
          rate: tax.rate,
          type: tax.type ?? "VAT",
        })),
      });
    }

    if (ruleCount === 0) {
      const accounts = await prisma.chartOfAccount.findMany({
        where: { companyId },
        select: { id: true, code: true },
      });
      const accountByCode = new Map(accounts.map((account) => [account.code, account.id]));

      for (const rule of DEFAULT_POSTING_RULES) {
        await prisma.postingRule.upsert({
          where: {
            companyId_sourceType: {
              companyId,
              sourceType: rule.sourceType,
            },
          },
          update: { name: rule.name, isActive: true },
          create: {
            companyId,
            name: rule.name,
            sourceType: rule.sourceType,
            isActive: true,
            lines: {
              create: rule.lines
                .map((line) => {
                  const accountId = accountByCode.get(line.accountCode);
                  if (!accountId) return null;
                  return {
                    accountId,
                    direction: line.direction,
                    basis: line.basis,
                    allocationType: "PERCENT",
                    allocationValue: line.allocationPercent ?? 100,
                  };
                })
                .filter(Boolean) as Array<{
                accountId: string;
                direction: "DEBIT" | "CREDIT";
                basis: "AMOUNT" | "NET" | "TAX" | "GROSS" | "DEDUCTIONS" | "ALLOWANCES";
                allocationType: "PERCENT";
                allocationValue: number;
              }>,
            },
          },
        });
      }
    }

    return successResponse({
      accountsInitialized: accountCount === 0,
      taxInitialized: taxCount === 0,
      rulesInitialized: ruleCount === 0,
    });
  } catch (error) {
    console.error("[API] POST /api/accounting/setup error:", error);
    return errorResponse("Failed to initialize accounting setup");
  }
}
