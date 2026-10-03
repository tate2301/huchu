import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { RETAIL_AUDIT_EVENTS, writeRetailAuditEvent, type RetailAuditActor } from "@/lib/retail/audit";
import { ensureRetailCategories } from "@/lib/retail/categories";
import {
  DEFAULT_SHOP_PROFILE,
  shopFeatures,
  type ShopProfile,
  type ShopProfileInput,
} from "@/lib/retail/shop-profile-rules";

export * from "@/lib/retail/shop-profile-rules";

/**
 * Reading and saving the shop's profile. The rules — what each type switches
 * on, the licence-hours clock, who may change it — are in
 * `shop-profile-rules.ts`, which the browser can import without Prisma.
 */

type ProfileRow = Prisma.RetailShopProfileGetPayload<object>;

function toProfile(row: ProfileRow | null): ShopProfile {
  if (!row) return DEFAULT_SHOP_PROFILE;
  return {
    businessType: row.businessType,
    ageCheck: row.ageCheck,
    licenceHours: row.licenceHours,
    emptiesAndDeposits: row.emptiesAndDeposits,
    casesAndSingles: row.casesAndSingles,
    weekdayOpensAt: row.weekdayOpensAt,
    weekdayClosesAt: row.weekdayClosesAt,
    sundayOpensAt: row.sundayOpensAt,
    sundayClosesAt: row.sundayClosesAt,
    licenceNumber: row.licenceNumber,
    licenceExpiresOn: row.licenceExpiresOn ? row.licenceExpiresOn.toISOString().slice(0, 10) : null,
    saved: true,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function loadShopProfile(companyId: string): Promise<ShopProfile> {
  const row = await prisma.retailShopProfile.findUnique({ where: { companyId } });
  return toProfile(row);
}

/**
 * Save the profile, seed the business type's categories, and say so in the
 * audit chain — all or nothing.
 *
 * Categories are only ever added here. Switching from a liquor store to General
 * retail leaves Beer and Spirits where they are, because products are filed
 * under them; the owner archives what they no longer want.
 */
export async function saveShopProfile(
  actor: RetailAuditActor,
  input: ShopProfileInput,
): Promise<ShopProfile> {
  const data = {
    businessType: input.businessType,
    ageCheck: input.ageCheck,
    licenceHours: input.licenceHours,
    emptiesAndDeposits: input.emptiesAndDeposits,
    casesAndSingles: input.casesAndSingles,
    weekdayOpensAt: input.weekdayOpensAt,
    weekdayClosesAt: input.weekdayClosesAt,
    sundayOpensAt: input.sundayOpensAt,
    sundayClosesAt: input.sundayClosesAt,
    licenceNumber: input.licenceNumber?.trim() || null,
    licenceExpiresOn: input.licenceExpiresOn ? new Date(`${input.licenceExpiresOn}T00:00:00.000Z`) : null,
    updatedById: actor.userId,
  };

  const row = await prisma.$transaction(async (tx) => {
    const before = await tx.retailShopProfile.findUnique({
      where: { companyId: actor.companyId },
      select: { businessType: true },
    });
    const saved = await tx.retailShopProfile.upsert({
      where: { companyId: actor.companyId },
      create: { companyId: actor.companyId, ...data },
      update: data,
    });
    const seeded = await ensureRetailCategories(tx, actor.companyId, input.businessType);
    await writeRetailAuditEvent(tx, {
      actor,
      eventType: RETAIL_AUDIT_EVENTS.shopProfileChanged,
      entityType: "RetailShopProfile",
      entityId: actor.companyId,
      payload: {
        businessTypeBefore: before?.businessType ?? null,
        businessType: saved.businessType,
        features: shopFeatures(saved),
        categoriesAdded: seeded,
      },
    });
    return saved;
  });

  return toProfile(row);
}
