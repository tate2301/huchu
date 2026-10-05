import type { RetailBusinessType } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { GENERAL_RETAIL, LIQUOR_STORE } from "@/lib/retail/settings-pages/company";
import { loadShopProfile, saveShopProfile, type ShopProfilePatch } from "@/lib/retail/shop-profile";
import { hoursWindowText, parseHoursWindow } from "@/lib/retail/shop-profile-rules";
import { formatDay, parseDay } from "@/lib/workspace/format";

import type { SettingsStore } from "./types";

/**
 * The Shop page's values (4.10 `company`): the shop profile it changes, and
 * the business and money it shows from Management's records.
 */

const BUSINESS_TYPE_OF: Record<string, RetailBusinessType> = {
  [GENERAL_RETAIL]: "GENERAL",
  [LIQUOR_STORE]: "LIQUOR",
};

/** "January", for a month number 1–12. */
function monthName(month: number): string {
  return new Intl.DateTimeFormat("en-GB", { month: "long", timeZone: "UTC" }).format(Date.UTC(2000, month - 1, 1));
}

/** The stored base currency as the page draws it. */
export function currencyLabel(baseCurrency: string | null | undefined): string {
  return (baseCurrency ?? "USD").toUpperCase() === "USD" ? "US$" : "ZiG";
}

/** The page's changes as a shop-profile patch. */
export function companyProfilePatch(changes: Record<string, unknown>): ShopProfilePatch {
  const patch: ShopProfilePatch = {};
  if (typeof changes.businessType === "string") patch.businessType = BUSINESS_TYPE_OF[changes.businessType];
  for (const key of ["ageCheck", "licenceHours", "emptiesAndDeposits", "casesAndSingles"] as const) {
    if (typeof changes[key] === "boolean") patch[key] = changes[key];
  }
  if (typeof changes.weekdayHours === "string") {
    const window = parseHoursWindow(changes.weekdayHours);
    if (window) {
      patch.weekdayOpensAt = window.opens;
      patch.weekdayClosesAt = window.closes;
    }
  }
  if (typeof changes.sundayHours === "string") {
    const window = parseHoursWindow(changes.sundayHours);
    if (window) {
      patch.sundayOpensAt = window.opens;
      patch.sundayClosesAt = window.closes;
    }
  }
  if (typeof changes.licenceNumber === "string") patch.licenceNumber = changes.licenceNumber.trim() || null;
  if (typeof changes.licenceExpiresOn === "string") {
    patch.licenceExpiresOn = changes.licenceExpiresOn.trim() ? parseDay(changes.licenceExpiresOn) : null;
  }
  return patch;
}

export const companySettings: SettingsStore = {
  async load(companyId) {
    const [profile, branding, accounting] = await Promise.all([
      loadShopProfile(companyId),
      prisma.companyBranding.findUnique({
        where: { companyId },
        select: {
          tradingName: true,
          legalName: true,
          registrationNumber: true,
          vatNumber: true,
          taxNumber: true,
          phone: true,
          email: true,
          physicalAddress: true,
          logoUrl: true,
        },
      }),
      prisma.accountingSettings.findUnique({
        where: { companyId },
        select: { baseCurrency: true, fiscalYearStartMonth: true },
      }),
    ]);
    return {
      businessType: profile.businessType === "LIQUOR" ? LIQUOR_STORE : GENERAL_RETAIL,
      ageCheck: profile.ageCheck,
      licenceHours: profile.licenceHours,
      weekdayHours: hoursWindowText(profile.weekdayOpensAt, profile.weekdayClosesAt),
      sundayHours: hoursWindowText(profile.sundayOpensAt, profile.sundayClosesAt),
      emptiesAndDeposits: profile.emptiesAndDeposits,
      casesAndSingles: profile.casesAndSingles,
      licenceNumber: profile.licenceNumber ?? "",
      licenceExpiresOn: profile.licenceExpiresOn ? formatDay(profile.licenceExpiresOn) : "",
      tradingName: branding?.tradingName ?? "",
      legalName: branding?.legalName ?? "",
      registrationNumber: branding?.registrationNumber ?? "",
      vatNumber: branding?.vatNumber ?? "",
      taxNumber: branding?.taxNumber ?? "",
      phone: branding?.phone ?? "",
      email: branding?.email ?? "",
      address: branding?.physicalAddress ?? "",
      logoUrl: branding?.logoUrl ?? null,
      currency: currencyLabel(accounting?.baseCurrency),
      financialYearStarts: `1 ${monthName(accounting?.fiscalYearStartMonth ?? 1)}`,
    };
  },

  async save(tx, actor, changes) {
    const patch = companyProfilePatch(changes);
    if (Object.keys(patch).length > 0) await saveShopProfile(tx, actor, patch);
  },

  related: (companyId) => [{ entityType: "RetailShopProfile", ids: [companyId] }],
};
