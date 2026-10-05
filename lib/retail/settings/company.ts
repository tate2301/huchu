import type { RetailBusinessType } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  GENERAL_RETAIL,
  LIQUOR_STORE,
  pricesLockedHint,
  YEAR_STARTS,
} from "@/lib/retail/settings-pages/company";
import { loadShopProfile, saveShopProfile, type ShopProfilePatch } from "@/lib/retail/shop-profile";
import { hoursWindowText, parseHoursWindow } from "@/lib/retail/shop-profile-rules";
import { formatDay, parseDay } from "@/lib/workspace/format";

import { SettingsRefused, type SettingsStore } from "./types";

/**
 * The Shop page's values (4.10 `company`): the shop profile it changes, and
 * the business and money it shows from Management's records.
 */

const BUSINESS_TYPE_OF: Record<string, RetailBusinessType> = {
  [GENERAL_RETAIL]: "GENERAL",
  [LIQUOR_STORE]: "LIQUOR",
};

/** The stored base currency as the page draws it. */
export function currencyLabel(baseCurrency: string | null | undefined): string {
  return (baseCurrency ?? "USD").toUpperCase() === "USD" ? "US$" : "ZiG";
}

/** "ZiG" → "ZWG": the page's word as the stored currency code. */
export function currencyCode(label: string): "USD" | "ZWG" {
  return label === "ZiG" ? "ZWG" : "USD";
}

/** "1 March" → 3. */
export function yearStartMonth(label: string): number {
  return YEAR_STARTS.indexOf(label) + 1;
}

/** Prices are fixed in their currency once a sale is recorded in it. */
async function pricesLocked(db: Pick<typeof prisma, "retailSale">, companyId: string): Promise<boolean> {
  return (await db.retailSale.findFirst({ where: { companyId }, select: { id: true } })) !== null;
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
  if (typeof changes.whatsapp === "string") patch.whatsapp = changes.whatsapp.trim() || null;
  if (typeof changes.vatRegistered === "boolean") patch.vatRegistered = changes.vatRegistered;
  if (changes.defaultSiteId !== undefined) patch.defaultSiteId = (changes.defaultSiteId as string | null) ?? null;
  return patch;
}

export const companySettings: SettingsStore = {
  async load(companyId) {
    const [profile, branding, accounting, locked] = await Promise.all([
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
      pricesLocked(prisma, companyId),
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
      pricesLocked: locked,
      financialYearStarts: YEAR_STARTS[(accounting?.fiscalYearStartMonth ?? 1) - 1] ?? YEAR_STARTS[0],
      whatsapp: profile.whatsapp ?? "",
      vatRegistered: profile.vatRegistered,
      defaultSiteId: profile.defaultSiteId,
    };
  },

  async save(tx, actor, changes) {
    const { companyId } = actor;
    const patch = companyProfilePatch(changes);
    if (patch.defaultSiteId) {
      const site = await tx.site.findFirst({
        where: { id: patch.defaultSiteId, companyId, isActive: true },
        select: { id: true },
      });
      if (!site) throw new SettingsRefused("Choose one of your sites.", { status: 400, field: "defaultSiteId" });
    }
    if (Object.keys(patch).length > 0) await saveShopProfile(tx, actor, patch);

    const money: { baseCurrency?: string; fiscalYearStartMonth?: number } = {};
    if (typeof changes.currency === "string") {
      if (await pricesLocked(tx, companyId)) {
        const current = await tx.accountingSettings.findUnique({ where: { companyId }, select: { baseCurrency: true } });
        throw new SettingsRefused(pricesLockedHint(currencyLabel(current?.baseCurrency)), {
          status: 409,
          code: "PRICES_LOCKED",
        });
      }
      money.baseCurrency = currencyCode(changes.currency);
      await tx.priceList.updateMany({ where: { companyId, isDefault: true }, data: { currency: money.baseCurrency } });
    }
    if (typeof changes.financialYearStarts === "string") {
      money.fiscalYearStartMonth = yearStartMonth(changes.financialYearStarts);
    }
    if (Object.keys(money).length > 0) {
      await tx.accountingSettings.upsert({
        where: { companyId },
        create: { companyId, ...money },
        update: money,
      });
    }
  },

  related: (companyId) => [{ entityType: "RetailShopProfile", ids: [companyId] }],
};
