import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { writePlatformAuditEvent } from "@/lib/audit/platform";
import { RETAIL_AUDIT_EVENTS } from "@/lib/retail/audit";

import { harareMidnight, yearBefore } from "./dates";
import { lockCustomer } from "./ledger";
import { loadLoyaltySettings } from "./settings";
import { pointsValue } from "./spend";

/**
 * Points expire a year after they were earned (CUS-01, W-46), when the shop
 * says "After 12 months": the retail worker's `points-expiry` job, nightly.
 *
 * Per customer, what is due is everything earned (every positive row) before
 * today a year ago, less everything that has gone out to date (every negative
 * row: spent, taken back, expired). Spending takes the oldest points first,
 * so this is FIFO by construction, and a second run the same day finds
 * nothing due: the first run's EXPIRED rows are among what has gone out.
 */

type Due = { customerId: string; points: number };

/** Each customer with points due to expire on `today`, without writing anything. */
export async function pointsDue(companyId: string, today: string, db: Prisma.TransactionClient | typeof prisma = prisma, customerId?: string): Promise<Due[]> {
  const cutoff = harareMidnight(yearBefore(today));
  const rows = await db.$queryRaw<Array<{ customerId: string; due: bigint }>>`
    SELECT "customerId",
           SUM(CASE WHEN "points" > 0 AND "createdAt" < ${cutoff} THEN "points" ELSE 0 END)
         - SUM(CASE WHEN "points" < 0 THEN -"points" ELSE 0 END) AS due
    FROM "RetailPointsEntry"
    WHERE "companyId" = ${companyId}
    ${customerId ? Prisma.sql`AND "customerId" = ${customerId}` : Prisma.empty}
    GROUP BY "customerId"
    HAVING SUM(CASE WHEN "points" > 0 AND "createdAt" < ${cutoff} THEN "points" ELSE 0 END)
         - SUM(CASE WHEN "points" < 0 THEN -"points" ELSE 0 END) > 0`;
  return rows.map((row) => ({ customerId: row.customerId, points: Number(row.due) }));
}

/** What expiring would take tonight: Loyalty's warning when Never becomes After 12 months. */
export async function expiryPreview(companyId: string, today: string): Promise<{ customers: number; points: number }> {
  const due = await pointsDue(companyId, today);
  return { customers: due.length, points: due.reduce((sum, row) => sum + row.points, 0) };
}

/** Expire what is due for one company on `today`: one EXPIRED row a customer, dated 00:00 that day. */
export async function expirePoints(companyId: string, today: string): Promise<{ customers: number; points: number }> {
  const settings = await loadLoyaltySettings(companyId);
  if (settings.expiry !== "AFTER_12_MONTHS") return { customers: 0, points: 0 };
  const at = harareMidnight(today);
  let customers = 0;
  let points = 0;
  for (const candidate of await pointsDue(companyId, today)) {
    const expired = await prisma.$transaction(async (tx) => {
      // Read again under the customer's lock: a sale may have spent some meanwhile.
      await lockCustomer(tx, candidate.customerId);
      const [due] = await pointsDue(companyId, today, tx, candidate.customerId);
      if (!due || due.points <= 0) return 0;
      await tx.retailPointsEntry.create({
        data: {
          companyId,
          customerId: due.customerId,
          kind: "EXPIRED",
          points: -due.points,
          value: new Prisma.Decimal(pointsValue(due.points, settings.pointValue)).toDecimalPlaces(2),
          createdAt: at,
        },
      });
      // Nobody did it: the event's actor is empty and it says `automatic`, as the vouchers' lapse does.
      await writePlatformAuditEvent(
        {
          companyId,
          actorId: null,
          eventType: RETAIL_AUDIT_EVENTS.pointsExpired,
          entityType: "Customer",
          entityId: due.customerId,
          payload: { actorRole: null, actorName: null, points: due.points, automatic: true },
        },
        tx,
      );
      return due.points;
    });
    if (expired > 0) {
      customers += 1;
      points += expired;
    }
  }
  return { customers, points };
}
