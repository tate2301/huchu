import type { Prisma, RetailVoucherFunding, RetailVoucherKind } from "@prisma/client";

import { toNumberOrZero } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { writePlatformAuditEvent } from "@/lib/audit/platform";
import { RETAIL_AUDIT_EVENTS } from "@/lib/retail/audit";

import { dateOf, voucherToday } from "./dates";
import { postVoucherWriteOff } from "./posting";
import { isMoneyKind } from "./words";

/**
 * The retail worker's `voucher-expiry` job (W-18, PRD-10), daily at 00:10 in
 * Harare: every voucher whose expiry day has passed with something still on
 * it lapses. A money voucher's money is written off as a void's is
 * (`RETAIL_VOUCHER_EXPIRY`); a discount voucher just stops. The write is the
 * guard (`expiredAt` still empty and the day still passed, read under the
 * row's lock), so running it twice lapses nothing twice.
 */
export async function expireVouchers(now: Date = new Date(), companyId?: string): Promise<number> {
  const today = dateOf(voucherToday(now));
  const due = await prisma.retailVoucher.findMany({
    where: {
      ...(companyId ? { companyId } : {}),
      expiresOn: { lt: today },
      expiredAt: null,
      voidedAt: null,
      OR: [{ kind: { not: "DISCOUNT" }, balance: { gt: 0 } }, { kind: "DISCOUNT", usesLeft: { gt: 0 } }],
    },
    select: { id: true },
    orderBy: { expiresOn: "asc" },
  });
  let lapsed = 0;
  for (const { id } of due) {
    const done = await prisma.$transaction(async (tx) => {
      // The claim reads the voucher again under its row lock: an Extend that
      // landed since keeps it live, and what is written off is the balance
      // as it stands now, not as the list above read it before a late sale.
      const [voucher] = await tx.$queryRaw<
        Array<{ companyId: string; code: string; kind: RetailVoucherKind; funding: RetailVoucherFunding; balance: Prisma.Decimal; siteId: string | null }>
      >`
        UPDATE "RetailVoucher" SET "expiredAt" = ${now}, "updatedAt" = NOW()
        WHERE "id" = ${id} AND "expiredAt" IS NULL AND "voidedAt" IS NULL AND "expiresOn" < ${today}::date
        RETURNING "companyId", "code", "kind", "funding", "balance", "siteId"`;
      if (!voucher) return null;
      const left = isMoneyKind(voucher.kind) ? toNumberOrZero(voucher.balance) : 0;
      // Nobody did it: the event's actor is empty and it says `automatic`, as the bin's purge does.
      await writePlatformAuditEvent(
        {
          companyId: voucher.companyId,
          actorId: null,
          eventType: RETAIL_AUDIT_EVENTS.voucherExpired,
          entityType: "RetailVoucher",
          entityId: id,
          payload: { actorRole: null, actorName: null, code: voucher.code, left: isMoneyKind(voucher.kind) ? left.toFixed(2) : null, automatic: true },
        },
        tx,
      );
      return { ...voucher, left };
    });
    if (!done) continue;
    lapsed += 1;
    await postVoucherWriteOff(
      { companyId: done.companyId, userId: null },
      { sourceType: "RETAIL_VOUCHER_EXPIRY", voucherId: id, code: done.code, funding: done.funding, left: done.left, siteId: done.siteId, at: now },
    );
  }
  return lapsed;
}
