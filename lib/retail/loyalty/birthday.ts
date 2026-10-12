import { Prisma } from "@prisma/client";

import { writePlatformAuditEvent } from "@/lib/audit/platform";
import { prisma } from "@/lib/prisma";
import { RETAIL_AUDIT_EVENTS } from "@/lib/retail/audit";
import { shopNames } from "@/lib/retail/vouchers/issue";
import { formatCount } from "@/lib/workspace/format";

import { harareMidnight, isoWeekday, weekMonthDays } from "./dates";
import { lockCustomer } from "./ledger";
import { loadLoyaltySettings } from "./settings";
import { pointsValue } from "./spend";

/**
 * The birthday bonus (CUS-01, W-46): the retail worker's `birthday-bonus`
 * job, on Mondays in Harare. Every live customer whose birthday falls in the
 * week starting today, and who has had no bonus this calendar year, gets
 * `birthdayPoints`; with their consent and a number, a WhatsApp message too.
 */

export const BIRTHDAY_TEMPLATE = "birthday";

/** "Happy birthday, Tapiwa. 200 points from Harare Bottle Store, to spend this week." */
export const birthdayMessage = (name: string, points: number, shop: string) =>
  `Happy birthday, ${name.trim().split(/\s+/)[0] || name}. ${formatCount(points)} points from ${shop}, to spend this week.`;

export async function birthdayBonuses(companyId: string, today: string): Promise<number> {
  if (isoWeekday(today) !== 1) return 0;
  const settings = await loadLoyaltySettings(companyId);
  if (!settings.enabled || !settings.birthdayBonus || settings.birthdayPoints <= 0) return 0;
  const week = weekMonthDays(today);
  const yearStart = harareMidnight(`${today.slice(0, 4)}-01-01`);
  const candidates = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "Customer"
    WHERE "companyId" = ${companyId} AND "isActive" AND "archivedAt" IS NULL AND "mergedIntoId" IS NULL
      AND "dateOfBirth" IS NOT NULL AND to_char("dateOfBirth", 'MM-DD') IN (${Prisma.join(week)})`;
  const { shop } = await shopNames(prisma, companyId);
  const at = harareMidnight(today);
  let given = 0;
  for (const { id } of candidates) {
    const done = await prisma.$transaction(async (tx) => {
      await lockCustomer(tx, id);
      const already = await tx.retailPointsEntry.count({ where: { customerId: id, kind: "BIRTHDAY", createdAt: { gte: yearStart } } });
      if (already > 0) return false;
      const customer = await tx.customer.findUniqueOrThrow({
        where: { id },
        select: { name: true, phone: true, whatsapp: true, marketingConsent: true },
      });
      await tx.retailPointsEntry.create({
        data: {
          companyId,
          customerId: id,
          kind: "BIRTHDAY",
          points: settings.birthdayPoints,
          value: new Prisma.Decimal(pointsValue(settings.birthdayPoints, settings.pointValue)).toDecimalPlaces(2),
          createdAt: at,
        },
      });
      await writePlatformAuditEvent(
        {
          companyId,
          actorId: null,
          eventType: RETAIL_AUDIT_EVENTS.pointsBirthday,
          entityType: "Customer",
          entityId: id,
          payload: { actorRole: null, actorName: null, points: settings.birthdayPoints, automatic: true },
        },
        tx,
      );
      const to = customer.whatsapp ?? customer.phone;
      if (customer.marketingConsent && to) {
        await tx.retailMessage.create({
          data: {
            companyId,
            channel: "WHATSAPP",
            to,
            template: BIRTHDAY_TEMPLATE,
            body: birthdayMessage(customer.name, settings.birthdayPoints, shop),
            entityType: "Customer",
            entityId: id,
          },
        });
      }
      return true;
    });
    if (done) given += 1;
  }
  return given;
}
