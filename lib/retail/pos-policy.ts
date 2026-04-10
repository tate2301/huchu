import { prisma } from "@/lib/prisma";
import { DEFAULT_RETAIL_TENDER_POLICY, type RetailTenderType } from "@/lib/retail/tender-policy";

export type RetailPosPolicy = {
  requiredReferenceTenders: RetailTenderType[];
  minReferenceLength: number;
  referencePattern: string;
  splitTenderEnabled: boolean;
  refundRequiresReason: boolean;
  voidRequiresReason: boolean;
  requireSupervisorForRefunds: boolean;
};

export const DEFAULT_RETAIL_POS_POLICY: RetailPosPolicy = {
  requiredReferenceTenders: DEFAULT_RETAIL_TENDER_POLICY.requiredReferenceTenders,
  minReferenceLength: DEFAULT_RETAIL_TENDER_POLICY.minReferenceLength,
  referencePattern: DEFAULT_RETAIL_TENDER_POLICY.referencePattern,
  splitTenderEnabled: false,
  refundRequiresReason: true,
  voidRequiresReason: true,
  requireSupervisorForRefunds: true,
};

export const RETAIL_POS_POLICY_PROVIDER_KEY = "RETAIL_POS_POLICY";

function normalizeReferenceTenders(value: unknown): RetailTenderType[] {
  if (!Array.isArray(value)) return DEFAULT_RETAIL_POS_POLICY.requiredReferenceTenders;
  const allowed: RetailTenderType[] = ["CASH", "CARD", "MOBILE_MONEY", "TRANSFER", "VOUCHER"];
  const normalized = value.filter((item): item is RetailTenderType => allowed.includes(String(item) as RetailTenderType));
  return normalized.length > 0 ? normalized : DEFAULT_RETAIL_POS_POLICY.requiredReferenceTenders;
}

function parseBoolean(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function parsePolicy(metadataJson: string | null | undefined): RetailPosPolicy {
  if (!metadataJson) {
    return DEFAULT_RETAIL_POS_POLICY;
  }

  try {
    const parsed = JSON.parse(metadataJson) as Partial<RetailPosPolicy>;
    return {
      requiredReferenceTenders: normalizeReferenceTenders(parsed.requiredReferenceTenders),
      minReferenceLength:
        typeof parsed.minReferenceLength === "number" && parsed.minReferenceLength > 0
          ? Math.floor(parsed.minReferenceLength)
          : DEFAULT_RETAIL_POS_POLICY.minReferenceLength,
      referencePattern:
        typeof parsed.referencePattern === "string" && parsed.referencePattern.trim()
          ? parsed.referencePattern.trim()
          : DEFAULT_RETAIL_POS_POLICY.referencePattern,
      splitTenderEnabled: parseBoolean(parsed.splitTenderEnabled, DEFAULT_RETAIL_POS_POLICY.splitTenderEnabled),
      refundRequiresReason: parseBoolean(parsed.refundRequiresReason, DEFAULT_RETAIL_POS_POLICY.refundRequiresReason),
      voidRequiresReason: parseBoolean(parsed.voidRequiresReason, DEFAULT_RETAIL_POS_POLICY.voidRequiresReason),
      requireSupervisorForRefunds: parseBoolean(
        parsed.requireSupervisorForRefunds,
        DEFAULT_RETAIL_POS_POLICY.requireSupervisorForRefunds,
      ),
    };
  } catch {
    return DEFAULT_RETAIL_POS_POLICY;
  }
}

export async function getRetailPosPolicy(companyId: string): Promise<RetailPosPolicy> {
  const record = await prisma.fiscalisationProviderConfig.findFirst({
    where: { companyId, providerKey: RETAIL_POS_POLICY_PROVIDER_KEY, isActive: true },
    select: { metadataJson: true },
  });
  return parsePolicy(record?.metadataJson);
}

export async function saveRetailPosPolicy(companyId: string, policy: RetailPosPolicy) {
  return prisma.fiscalisationProviderConfig.upsert({
    where: {
      companyId_providerKey: {
        companyId,
        providerKey: RETAIL_POS_POLICY_PROVIDER_KEY,
      },
    },
    update: {
      metadataJson: JSON.stringify(policy),
      isActive: true,
    },
    create: {
      companyId,
      providerKey: RETAIL_POS_POLICY_PROVIDER_KEY,
      metadataJson: JSON.stringify(policy),
      isActive: true,
    },
    select: { id: true },
  });
}

