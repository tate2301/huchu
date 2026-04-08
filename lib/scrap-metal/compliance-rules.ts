import type { PrismaClient, ScrapMetalCategory, ScrapTicketComplianceRule } from "@prisma/client";

type TicketDirection = "INBOUND" | "OUTBOUND";

export type ScrapTicketComplianceRequirements = {
  requirePhotos: boolean;
  requirePaymentMethod: boolean;
  requirePaymentReference: boolean;
  requireNotes: boolean;
  matchedRuleIds: string[];
};

const DEFAULT_REQUIREMENTS: ScrapTicketComplianceRequirements = {
  requirePhotos: false,
  requirePaymentMethod: false,
  requirePaymentReference: false,
  requireNotes: false,
  matchedRuleIds: [],
};

function matchesDirection(ruleScope: string, direction: TicketDirection) {
  return ruleScope === "BOTH" || ruleScope === direction;
}

function matchesMaterial(rule: ScrapTicketComplianceRule, materialId: string | null | undefined) {
  if (!rule.materialId) return true;
  return rule.materialId === (materialId ?? null);
}

function matchesCategory(rule: ScrapTicketComplianceRule, category: ScrapMetalCategory | string | null | undefined) {
  if (!rule.category) return true;
  return rule.category === category;
}

export async function resolveScrapTicketComplianceRequirements(
  prisma: PrismaClient,
  input: {
    companyId: string;
    direction: TicketDirection;
    materialId?: string | null;
    category?: ScrapMetalCategory | string | null;
  },
): Promise<ScrapTicketComplianceRequirements> {
  const rules = await prisma.scrapTicketComplianceRule.findMany({
    where: {
      companyId: input.companyId,
      isActive: true,
    },
    orderBy: [{ materialId: "desc" }, { category: "desc" }, { createdAt: "asc" }],
  });

  if (rules.length === 0) return DEFAULT_REQUIREMENTS;

  const matched = rules.filter(
    (rule) =>
      matchesDirection(rule.scope, input.direction) &&
      matchesMaterial(rule, input.materialId) &&
      matchesCategory(rule, input.category),
  );

  if (matched.length === 0) return DEFAULT_REQUIREMENTS;

  return {
    requirePhotos: matched.some((rule) => rule.requirePhotos),
    requirePaymentMethod: matched.some((rule) => rule.requirePaymentMethod),
    requirePaymentReference: matched.some((rule) => rule.requirePaymentReference),
    requireNotes: matched.some((rule) => rule.requireNotes),
    matchedRuleIds: matched.map((rule) => rule.id),
  };
}
