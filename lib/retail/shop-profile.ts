import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { RETAIL_AUDIT_EVENTS, writeRetailAuditEvent, type RetailAuditActor } from "@/lib/retail/audit";
import { ensureRetailCategories } from "@/lib/retail/categories";
import { DEFAULT_SHOP_PROFILE, shopFeatures, type ShopProfile } from "@/lib/retail/shop-profile-rules";

export * from "@/lib/retail/shop-profile-rules";

/**
 * Reading and saving the shop's profile. The rules — what each type switches
 * on, when a liquor sale is refused — are in
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
    licenceNumber: row.licenceNumber,
    licenceExpiresOn: row.licenceExpiresOn ? row.licenceExpiresOn.toISOString().slice(0, 10) : null,
    whatsapp: row.whatsapp,
    vatRegistered: row.vatRegistered,
    defaultSiteId: row.defaultSiteId,
    saved: true,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function loadShopProfile(companyId: string): Promise<ShopProfile> {
  const row = await prisma.retailShopProfile.findUnique({ where: { companyId } });
  return toProfile(row);
}

/** What a save may change: any of the profile's own fields. */
export type ShopProfilePatch = Partial<Omit<ShopProfile, "saved" | "updatedAt">>;

/**
 * Write part of the profile, seed the business type's categories, and say so
 * in the audit chain, inside the caller's transaction so a settings page's
 * save and its own event commit together.
 *
 * Categories are only ever added here. Switching from a liquor store to General
 * retail leaves Beer and Spirits where they are, because products are filed
 * under them; the owner archives what they no longer want.
 */
export async function saveShopProfile(
  tx: Prisma.TransactionClient,
  actor: RetailAuditActor,
  patch: ShopProfilePatch,
): Promise<ShopProfile> {
  const data: Prisma.RetailShopProfileUncheckedUpdateInput = { updatedById: actor.userId };
  for (const key of [
    "businessType",
    "ageCheck",
    "licenceHours",
    "emptiesAndDeposits",
    "casesAndSingles",
    "vatRegistered",
    "defaultSiteId",
  ] as const) {
    if (patch[key] !== undefined) (data as Record<string, unknown>)[key] = patch[key];
  }
  if (patch.licenceNumber !== undefined) data.licenceNumber = patch.licenceNumber?.trim() || null;
  if (patch.whatsapp !== undefined) data.whatsapp = patch.whatsapp?.trim() || null;
  if (patch.licenceExpiresOn !== undefined) {
    data.licenceExpiresOn = patch.licenceExpiresOn ? new Date(`${patch.licenceExpiresOn}T00:00:00.000Z`) : null;
  }

  const before = toProfile(await tx.retailShopProfile.findUnique({ where: { companyId: actor.companyId } }));
  const saved = await tx.retailShopProfile.upsert({
    where: { companyId: actor.companyId },
    create: { ...(data as Prisma.RetailShopProfileUncheckedCreateInput), companyId: actor.companyId },
    update: data,
  });
  const seeded = await ensureRetailCategories(tx, actor.companyId, saved.businessType);
  await writeRetailAuditEvent(tx, {
    actor,
    eventType: RETAIL_AUDIT_EVENTS.shopProfileChanged,
    entityType: "RetailShopProfile",
    entityId: actor.companyId,
    payload: {
      businessTypeBefore: before.saved ? before.businessType : null,
      businessType: saved.businessType,
      featuresBefore: shopFeatures(before),
      features: shopFeatures(saved),
      categoriesAdded: seeded,
    },
  });
  return toProfile(saved);
}
