import type { Prisma } from "@prisma/client";

/**
 * Rows in `FiscalisationProviderConfig` that are not fiscal devices.
 *
 * Retail keeps three of its settings in this table as JSON under reserved
 * provider keys — the setup profile, the till rules and the tender policy
 * (`lib/retail/setup-profile.ts`, `pos-policy.ts`, `tender-policy.ts`). Every
 * retail workspace therefore has an "active provider" whether or not it has a
 * ZIMRA device, and a lookup that asked for "any active provider" found one:
 * the fiscal-day console listed `RETAIL_SETUP_PROFILE` as a device, and a till
 * sale was sent to be signed by a row with no device, no key and no endpoint.
 *
 * Asserted equal to the retail constants in `fiscal-device-scope.test.ts`.
 */
export const SETTINGS_PROVIDER_KEYS = [
  "RETAIL_SETUP_PROFILE",
  "RETAIL_POS_POLICY",
  "RETAIL_TENDER_POLICY",
] as const;

/** The company's active fiscal devices, and nothing that only lives beside them. */
export function fiscalDeviceWhere(companyId: string): Prisma.FiscalisationProviderConfigWhereInput {
  return {
    companyId,
    isActive: true,
    providerKey: { notIn: [...SETTINGS_PROVIDER_KEYS] },
  };
}

/** True for a provider key that names a device rather than a settings row. */
export function isFiscalDeviceKey(providerKey: string): boolean {
  return !(SETTINGS_PROVIDER_KEYS as readonly string[]).includes(providerKey);
}
