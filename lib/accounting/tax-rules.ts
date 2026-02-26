import { prisma } from "@/lib/prisma";

type AppliesTo = "SALES" | "PURCHASE";

function matchesAppliesTo(value: string | null | undefined, appliesTo: AppliesTo) {
  const normalized = String(value ?? "BOTH").toUpperCase();
  return normalized === "BOTH" || normalized === appliesTo;
}

function isRuleEffective(rule: { effectiveFrom: Date | null; effectiveTo: Date | null }, asOf: Date) {
  if (rule.effectiveFrom && rule.effectiveFrom > asOf) return false;
  if (rule.effectiveTo && rule.effectiveTo < asOf) return false;
  return true;
}

export async function resolveDefaultTaxTemplate(input: {
  companyId: string;
  appliesTo: AppliesTo;
  partyType: "CUSTOMER" | "VENDOR";
  partyId: string;
  documentDate: Date;
  currency?: string | null;
}) {
  const partyTaxCategoryId =
    input.partyType === "CUSTOMER"
      ? (
          await prisma.customer.findFirst({
            where: { id: input.partyId, companyId: input.companyId },
            select: { taxCategoryId: true },
          })
        )?.taxCategoryId
      : (
          await prisma.vendor.findFirst({
            where: { id: input.partyId, companyId: input.companyId },
            select: { taxCategoryId: true },
          })
        )?.taxCategoryId;

  const candidateRules = await prisma.taxRule.findMany({
    where: {
      companyId: input.companyId,
      isActive: true,
      template: { isActive: true },
      ...(input.currency
        ? {
            OR: [{ currency: null }, { currency: input.currency }],
          }
        : {}),
    },
    include: {
      template: {
        include: {
          lines: {
            include: {
              taxCode: true,
            },
            orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
          },
        },
      },
    },
    orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
  });

  const matchingRule = candidateRules.find((rule) => {
    if (!matchesAppliesTo(rule.appliesTo, input.appliesTo)) return false;
    if (!isRuleEffective(rule, input.documentDate)) return false;
    if (!partyTaxCategoryId) {
      return !rule.taxCategoryId;
    }
    if (!rule.taxCategoryId) return true;
    return rule.taxCategoryId === partyTaxCategoryId;
  });

  if (!matchingRule) {
    const settings = await prisma.accountingSettings.findUnique({
      where: { companyId: input.companyId },
      select: { defaultTaxCodeId: true },
    });

    if (!settings?.defaultTaxCodeId) {
      return {
        ruleId: null,
        templateId: null,
        defaultTaxCodeId: null,
      };
    }

    const taxCode = await prisma.taxCode.findFirst({
      where: {
        id: settings.defaultTaxCodeId,
        companyId: input.companyId,
        isActive: true,
      },
      select: { id: true },
    });

    return {
      ruleId: null,
      templateId: null,
      defaultTaxCodeId: taxCode?.id ?? null,
    };
  }

  const defaultLine = matchingRule.template.lines.find(
    (line) => line.isDefault && line.taxCode.isActive && matchesAppliesTo(line.appliesTo, input.appliesTo),
  ) ??
    matchingRule.template.lines.find(
      (line) => line.taxCode.isActive && matchesAppliesTo(line.appliesTo, input.appliesTo),
    );

  return {
    ruleId: matchingRule.id,
    templateId: matchingRule.templateId,
    defaultTaxCodeId: defaultLine?.taxCodeId ?? null,
  };
}
