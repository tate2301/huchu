import type { Prisma } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { RETAIL_AUDIT_EVENTS, writeRetailAuditEvent, type RetailAuditActor } from "@/lib/retail/audit";
import { licenceWeekText, type LicenceWindow } from "@/lib/retail/licence-hours";
import { loadShopProfile, shopFeatures } from "@/lib/retail/shop-profile";

/**
 * Reading and saving a site's licence hours (`RetailLicenceHours`). The rule
 * they feed — when an 18+ product may sell — is `lib/retail/licence-hours.ts`,
 * which the till runs in the browser too.
 */

type Db = Prisma.TransactionClient | typeof prisma;

/** A site's licence hours, Sunday first. No rows: it sells all day, every day. */
export async function loadLicenceHours(companyId: string, siteId: string, db: Db = prisma): Promise<LicenceWindow[]> {
  return db.retailLicenceHours.findMany({
    where: { companyId, siteId },
    orderBy: { weekday: "asc" },
    select: { weekday: true, alcoholFrom: true, alcoholUntil: true },
  });
}

const minutes = z.number().int().min(0).max(24 * 60 - 1);

/** The week as the editor sends it: a weekday left out sells all day. */
export const licenceWeekSchema = z.object({
  days: z
    .array(z.object({ weekday: z.number().int().min(0).max(6), alcoholFrom: minutes, alcoholUntil: minutes }))
    .max(7)
    .refine((days) => new Set(days.map((day) => day.weekday)).size === days.length, "A weekday appears twice."),
});

export type SiteLicence = {
  siteId: string;
  name: string;
  closed: boolean;
  /** The shop's licence-hours switch, as the till reads it: a liquor store with it on. */
  enforced: boolean;
  days: LicenceWindow[];
};

/** A site's licence hours for its sheet, or null when the site is not this shop's. */
export async function loadSiteLicence(companyId: string, siteId: string): Promise<SiteLicence | null> {
  const site = await prisma.site.findFirst({
    where: { id: siteId, companyId },
    select: { id: true, name: true, closedAt: true },
  });
  if (!site) return null;
  const [profile, days] = await Promise.all([loadShopProfile(companyId), loadLicenceHours(companyId, site.id)]);
  return { siteId: site.id, name: site.name, closed: site.closedAt !== null, enforced: shopFeatures(profile).licenceHours, days };
}

export class LicenceRefusal extends Error {
  constructor(
    readonly status: 404 | 409,
    message: string,
  ) {
    super(message);
    this.name = "LicenceRefusal";
  }
}

/**
 * Replace a site's week: what is sent is the licence. Writes
 * `RETAIL_SITE.CHANGED` with the week before and after, when it moved.
 */
export async function saveLicenceHours(
  actor: RetailAuditActor,
  siteId: string,
  days: LicenceWindow[],
): Promise<SiteLicence> {
  const { companyId } = actor;
  await prisma.$transaction(async (tx) => {
    const site = await tx.site.findFirst({ where: { id: siteId, companyId }, select: { id: true, name: true, closedAt: true } });
    if (!site) throw new LicenceRefusal(404, "That site is not one of this shop's.");
    if (site.closedAt) throw new LicenceRefusal(409, "That site is closed. Its licence hours stay as they were.");

    const before = licenceWeekText(await loadLicenceHours(companyId, site.id, tx));
    await tx.retailLicenceHours.deleteMany({ where: { companyId, siteId: site.id } });
    await tx.retailLicenceHours.createMany({ data: days.map((day) => ({ companyId, siteId: site.id, ...day })) });
    const after = licenceWeekText(days);
    if (before !== after) {
      await writeRetailAuditEvent(tx, {
        actor,
        eventType: RETAIL_AUDIT_EVENTS.siteChanged,
        entityType: "Site",
        entityId: site.id,
        payload: { name: site.name, changes: { licenceHours: { from: before, to: after } }, placesAdded: [], placesRemoved: [], stockMoved: 0 },
      });
    }
  });
  return (await loadSiteLicence(companyId, siteId))!;
}
