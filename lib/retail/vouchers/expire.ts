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
 * guard (`expiredAt` still empty), so running it twice lapses nothing twice.
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
    select: { id: true, companyId: true, code: true, kind: true, funding: true, balance: true, siteId: true },
    orderBy: { expiresOn: "asc" },
  });
  let lapsed = 0;
  for (const voucher of due) {
    const left = isMoneyKind(voucher.kind) ? toNumberOrZero(voucher.balance) : 0;
    const done = await prisma.$transaction(async (tx) => {
      const claimed = await tx.retailVoucher.updateMany({
        where: { id: voucher.id, expiredAt: null, voidedAt: null },
        data: { expiredAt: now },
      });
      if (claimed.count !== 1) return false;
      // Nobody did it: the event's actor is empty and it says `automatic`, as the bin's purge does.
      await writePlatformAuditEvent(
        {
          companyId: voucher.companyId,
          actorId: null,
          eventType: RETAIL_AUDIT_EVENTS.voucherExpired,
          entityType: "RetailVoucher",
          entityId: voucher.id,
          payload: { actorRole: null, actorName: null, code: voucher.code, left: isMoneyKind(voucher.kind) ? left.toFixed(2) : null, automatic: true },
        },
        tx,
      );
      return true;
    });
    if (!done) continue;
    lapsed += 1;
    await postVoucherWriteOff(
      { companyId: voucher.companyId, userId: null },
      { sourceType: "RETAIL_VOUCHER_EXPIRY", voucherId: voucher.id, code: voucher.code, funding: voucher.funding, left, siteId: voucher.siteId, at: now },
    );
  }
  return lapsed;
}
