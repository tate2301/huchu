import { prisma } from "@/lib/prisma";

/**
 * The shop's default till, kept as JSON until the device context replaces it
 * (SET-04). The default site is `RetailShopProfile.defaultSiteId` (SET-01).
 */
export type RetailSetupProfile = {
  defaultRegisterId: string | null;
  defaultRegisterName: string | null;
  defaultRegisterCode: string | null;
};

export const DEFAULT_RETAIL_SETUP_PROFILE: RetailSetupProfile = {
  defaultRegisterId: null,
  defaultRegisterName: null,
  defaultRegisterCode: null,
};

export const RETAIL_SETUP_PROFILE_PROVIDER_KEY = "RETAIL_SETUP_PROFILE";

function normalizeNullableText(value: string | null | undefined, maxLength: number) {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}

function parseProfile(metadataJson: string | null | undefined): RetailSetupProfile {
  if (!metadataJson) {
    return DEFAULT_RETAIL_SETUP_PROFILE;
  }

  try {
    const parsed = JSON.parse(metadataJson) as Partial<RetailSetupProfile>;
    return {
      defaultRegisterId:
        typeof parsed.defaultRegisterId === "string" && parsed.defaultRegisterId.trim()
          ? parsed.defaultRegisterId
          : null,
      defaultRegisterName: normalizeNullableText(parsed.defaultRegisterName ?? null, 120),
      defaultRegisterCode: normalizeNullableText(parsed.defaultRegisterCode ?? null, 50),
    };
  } catch {
    return DEFAULT_RETAIL_SETUP_PROFILE;
  }
}

export async function getRetailSetupProfile(companyId: string): Promise<RetailSetupProfile> {
  const record = await prisma.fiscalisationProviderConfig.findFirst({
    where: { companyId, providerKey: RETAIL_SETUP_PROFILE_PROVIDER_KEY, isActive: true },
    select: { metadataJson: true },
  });
  return parseProfile(record?.metadataJson);
}

export async function saveRetailSetupProfile(companyId: string, profile: RetailSetupProfile) {
  return prisma.fiscalisationProviderConfig.upsert({
    where: {
      companyId_providerKey: {
        companyId,
        providerKey: RETAIL_SETUP_PROFILE_PROVIDER_KEY,
      },
    },
    update: {
      metadataJson: JSON.stringify(profile),
      isActive: true,
    },
    create: {
      companyId,
      providerKey: RETAIL_SETUP_PROFILE_PROVIDER_KEY,
      metadataJson: JSON.stringify(profile),
      isActive: true,
    },
    select: { id: true },
  });
}

