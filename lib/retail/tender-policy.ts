import { prisma } from "@/lib/prisma";

export type RetailTenderType = "CASH" | "CARD" | "MOBILE_MONEY" | "TRANSFER" | "VOUCHER";

export type RetailTenderPolicy = {
  requiredReferenceTenders: RetailTenderType[];
  minReferenceLength: number;
  referencePattern: string;
};

export const DEFAULT_RETAIL_TENDER_POLICY: RetailTenderPolicy = {
  requiredReferenceTenders: ["CARD", "MOBILE_MONEY"],
  minReferenceLength: 4,
  referencePattern: "^[A-Za-z0-9][A-Za-z0-9\\-/_ ]*$",
};

const POLICY_PROVIDER_KEY = "RETAIL_TENDER_POLICY";

export async function getRetailTenderPolicy(companyId: string): Promise<RetailTenderPolicy> {
  const record = await prisma.fiscalisationProviderConfig.findFirst({
    where: { companyId, providerKey: POLICY_PROVIDER_KEY, isActive: true },
    select: { metadataJson: true },
  });
  if (!record?.metadataJson) return DEFAULT_RETAIL_TENDER_POLICY;

  try {
    const parsed = JSON.parse(record.metadataJson) as Partial<RetailTenderPolicy>;
    const requiredReferenceTenders = Array.isArray(parsed.requiredReferenceTenders)
      ? parsed.requiredReferenceTenders.filter((value): value is RetailTenderType =>
          ["CASH", "CARD", "MOBILE_MONEY", "TRANSFER", "VOUCHER"].includes(String(value)),
        )
      : DEFAULT_RETAIL_TENDER_POLICY.requiredReferenceTenders;
    return {
      requiredReferenceTenders:
        requiredReferenceTenders.length > 0
          ? requiredReferenceTenders
          : DEFAULT_RETAIL_TENDER_POLICY.requiredReferenceTenders,
      minReferenceLength:
        typeof parsed.minReferenceLength === "number" && parsed.minReferenceLength > 0
          ? Math.floor(parsed.minReferenceLength)
          : DEFAULT_RETAIL_TENDER_POLICY.minReferenceLength,
      referencePattern:
        typeof parsed.referencePattern === "string" && parsed.referencePattern.trim().length > 0
          ? parsed.referencePattern
          : DEFAULT_RETAIL_TENDER_POLICY.referencePattern,
    };
  } catch {
    return DEFAULT_RETAIL_TENDER_POLICY;
  }
}

export async function saveRetailTenderPolicy(companyId: string, policy: RetailTenderPolicy) {
  return prisma.fiscalisationProviderConfig.upsert({
    where: {
      companyId_providerKey: {
        companyId,
        providerKey: POLICY_PROVIDER_KEY,
      },
    },
    update: {
      metadataJson: JSON.stringify(policy),
      isActive: true,
    },
    create: {
      companyId,
      providerKey: POLICY_PROVIDER_KEY,
      metadataJson: JSON.stringify(policy),
      isActive: true,
    },
    select: { id: true },
  });
}

export function validateTenderReferences(
  policy: RetailTenderPolicy,
  payments: Array<{ tenderType: string; reference: string | null }>,
) {
  const required = new Set(policy.requiredReferenceTenders);
  let pattern: RegExp;
  try {
    pattern = new RegExp(policy.referencePattern);
  } catch {
    pattern = new RegExp(DEFAULT_RETAIL_TENDER_POLICY.referencePattern);
  }
  for (const payment of payments) {
    if (!required.has(payment.tenderType as RetailTenderType)) continue;
    const reference = payment.reference?.trim() ?? "";
    if (reference.length < policy.minReferenceLength) {
      return `${payment.tenderType.replaceAll("_", " ")} reference is required`;
    }
    if (!pattern.test(reference)) {
      return `${payment.tenderType.replaceAll("_", " ")} reference format is invalid`;
    }
  }
  return null;
}
