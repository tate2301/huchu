import { z } from "zod";

import { toNumberOrZero } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { RETAIL_AUDIT_EVENTS, writeRetailAuditEvent, type RetailAuditActor } from "@/lib/retail/audit";

import { postVoucherWriteOff } from "./posting";
import { isMoneyKind } from "./words";

/**
 * Void it (W-18, PRD-10): `POST /api/v2/retail/vouchers/void { ids, reason }`
 * (promotions:delete). Each voucher not yet voided or lapsed is voided with the
 * reason, and what money was left on it is written off after the commit
 * (`RETAIL_VOUCHER_VOID`). One already void, or lapsed and written off by the
 * worker, is passed over.
 */

export const voidInput = z.object({
  ids: z.array(z.string().uuid()).min(1, "Tick at least one.").max(200),
  reason: z
    .string({ message: "Say why you are voiding it." })
    .trim()
    .min(3, "Say why you are voiding it.")
    .max(300, "Keep the reason to 300 characters."),
});

export async function voidVouchers(actor: RetailAuditActor, input: z.infer<typeof voidInput>, now: Date = new Date()): Promise<number> {
  const voided = await prisma.$transaction(async (tx) => {
    const done: Array<{ id: string; code: string; funding: "SOLD" | "GIVEN" | "REFUND"; left: number; siteId: string | null }> = [];
    for (const id of [...new Set(input.ids)]) {
      // The guard is the write: two voids at once void it once.
      const claimed = await tx.retailVoucher.updateMany({
        where: { id, companyId: actor.companyId, voidedAt: null, expiredAt: null },
        data: { voidedAt: now, voidedById: actor.userId, voidReason: input.reason },
      });
      if (claimed.count !== 1) continue;
      const row = await tx.retailVoucher.findUniqueOrThrow({
        where: { id },
        select: { code: true, kind: true, funding: true, balance: true, siteId: true },
      });
      const left = isMoneyKind(row.kind) ? toNumberOrZero(row.balance) : 0;
      await writeRetailAuditEvent(tx, {
        actor,
        eventType: RETAIL_AUDIT_EVENTS.voucherVoided,
        entityType: "RetailVoucher",
        entityId: id,
        reason: input.reason,
        payload: { code: row.code, reason: input.reason, left: isMoneyKind(row.kind) ? left.toFixed(2) : null },
      });
      done.push({ id, code: row.code, funding: row.funding, left, siteId: row.siteId });
    }
    return done;
  });
  for (const voucher of voided) {
    await postVoucherWriteOff(
      { companyId: actor.companyId, userId: actor.userId, userRole: actor.userRole },
      { sourceType: "RETAIL_VOUCHER_VOID", voucherId: voucher.id, code: voucher.code, funding: voucher.funding, left: voucher.left, siteId: voucher.siteId, at: now },
    );
  }
  return voided.length;
}
