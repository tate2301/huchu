import { Prisma, type RetailVoucherKind } from "@prisma/client";

import { toNumberOrZero } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { RETAIL_AUDIT_EVENTS, writeRetailAuditEvent, type RetailAuditActor } from "@/lib/retail/audit";
import { formatDay, formatMoney } from "@/lib/workspace/format";

import { dateOf, voucherToday } from "./dates";
import { VoucherRefusal } from "./issue";
import { dateKeyOf, isMoneyKind } from "./words";

/**
 * Spending a voucher at the till (W-18, PRD-10): the check the till runs on a
 * code and its secret, the secret's lockout, and the redemption inside the
 * sale's transaction — a guarded decrement, never read-then-write, so two
 * tills spending the last of one voucher at once cannot both have it.
 */

type Tx = Prisma.TransactionClient;

export const WRONG_SECRET = "That code and secret do not match.";
export const LOCKED = "Too many wrong codes. Try again in 15 minutes.";
export const NOTHING_LEFT = "Nothing is left on it.";
export const VOIDED = "It was voided.";
export const OTHER_SHOP = "It cannot be used at this shop.";
export const OFFLINE = "Vouchers need the till online.";

/** Five wrong secrets inside ten minutes lock the code for fifteen. */
const WRONG_WINDOW_MINUTES = 10;
const WRONG_LIMIT = 5;
const LOCK_MINUTES = 15;

export type VoucherCheck = {
  code: string;
  kind: RetailVoucherKind;
  /** Money left, for a money voucher. */
  left: number | null;
  percentOff: number | null;
  amountOff: number | null;
  usesLeft: number | null;
  minSale: number | null;
  expiresOn: string;
  usable: boolean;
  reason: string | null;
};

const voucherFields = {
  id: true,
  code: true,
  secret: true,
  kind: true,
  balance: true,
  percentOff: true,
  amountOff: true,
  usesLeft: true,
  minSale: true,
  expiresOn: true,
  expiredAt: true,
  voidedAt: true,
  siteId: true,
  lockedUntil: true,
} satisfies Prisma.RetailVoucherSelect;

type VoucherRow = Prisma.RetailVoucherGetPayload<{ select: typeof voucherFields }>;

const num = (value: Prisma.Decimal | null) => (value === null ? null : toNumberOrZero(value));

/** The code as printed: "gv-0019 " is GV-0019. */
export const normalizeCode = (code: string) => code.trim().toUpperCase();

/** What the printed barcode carries: the code and its secret, so a scan needs no typing. */
export const barcodeText = (code: string, secret: string) => `${code}-${secret}`;

/** A scanned barcode back to its code and secret; null when it is not one of ours. */
export function parseScan(text: string): { code: string; secret: string } | null {
  const match = /^([A-Z]{2}-\d{4,})-([A-Z2-9]{6})$/.exec(normalizeCode(text));
  return match ? { code: match[1]!, secret: match[2]! } : null;
}

/** Why a voucher cannot be spent now, judged off the row; null when it can. */
export function unusableReason(row: Omit<VoucherRow, "secret" | "lockedUntil" | "id" | "code">, input: { today: string; siteId: string | null; basketTotal?: number | null }): string | null {
  if (row.voidedAt) return VOIDED;
  const money = isMoneyKind(row.kind);
  if (money ? toNumberOrZero(row.balance) <= 0 : (row.usesLeft ?? 0) <= 0) return NOTHING_LEFT;
  const expiresOn = dateKeyOf(row.expiresOn);
  if (row.expiredAt || expiresOn < input.today) return `It expired on ${formatDay(expiresOn)}.`;
  if (row.siteId && input.siteId && row.siteId !== input.siteId) return OTHER_SHOP;
  const minSale = num(row.minSale);
  if (minSale !== null && minSale > 0 && input.basketTotal != null && input.basketTotal + 0.0001 < minSale) {
    return `It works on sales of ${formatMoney(minSale)} or more.`;
  }
  return null;
}

function checkOf(row: VoucherRow, reason: string | null): VoucherCheck {
  const money = isMoneyKind(row.kind);
  return {
    code: row.code,
    kind: row.kind,
    left: money ? toNumberOrZero(row.balance) : null,
    percentOff: num(row.percentOff),
    amountOff: num(row.amountOff),
    usesLeft: money ? null : row.usesLeft,
    minSale: num(row.minSale),
    expiresOn: dateKeyOf(row.expiresOn),
    usable: reason === null,
    reason,
  };
}

/**
 * A wrong secret, counted on the voucher with the shared client — never in
 * the sale's transaction, which a refusal rolls back. The count starts again
 * after ten quiet minutes; the fifth inside them locks the code for fifteen.
 */
async function countWrongSecret(id: string, now: Date): Promise<boolean> {
  const since = new Date(now.getTime() - WRONG_WINDOW_MINUTES * 60_000);
  const [row] = await prisma.$queryRaw<Array<{ wrongSecrets: number }>>`
    UPDATE "RetailVoucher" SET
      "wrongSecrets" = CASE WHEN "wrongSince" IS NULL OR "wrongSince" < ${since} THEN 1 ELSE "wrongSecrets" + 1 END,
      "wrongSince" = CASE WHEN "wrongSince" IS NULL OR "wrongSince" < ${since} THEN ${now} ELSE "wrongSince" END
    WHERE "id" = ${id}
    RETURNING "wrongSecrets"`;
  if (!row || row.wrongSecrets < WRONG_LIMIT) return false;
  await prisma.retailVoucher.update({
    where: { id },
    data: { lockedUntil: new Date(now.getTime() + LOCK_MINUTES * 60_000), wrongSecrets: 0, wrongSince: null },
  });
  return true;
}

export type CheckInput = {
  code: string;
  secret: string;
  siteId: string | null;
  basketTotal?: number | null;
  now?: Date;
};

/**
 * `checkVoucher` (`GET /api/v2/retail/pos/vouchers/check`, and again for
 * every voucher a sale names): the code and its secret, then whether it can
 * be spent here now. A code that is not this shop's reads the same as a wrong
 * secret, so the check does not say which codes exist.
 */
export async function checkVoucher(companyId: string, input: CheckInput): Promise<{ check: VoucherCheck | null; id: string | null; reason: string | null }> {
  const now = input.now ?? new Date();
  const row = await prisma.retailVoucher.findUnique({
    where: { companyId_code: { companyId, code: normalizeCode(input.code) } },
    select: voucherFields,
  });
  if (!row) return { check: null, id: null, reason: WRONG_SECRET };
  if (row.lockedUntil && row.lockedUntil.getTime() > now.getTime()) return { check: null, id: row.id, reason: LOCKED };
  if (normalizeCode(input.secret) !== row.secret) {
    const locked = await countWrongSecret(row.id, now);
    return { check: null, id: row.id, reason: locked ? LOCKED : WRONG_SECRET };
  }
  const reason = unusableReason(row, { today: voucherToday(now), siteId: input.siteId, basketTotal: input.basketTotal });
  return { check: checkOf(row, reason), id: row.id, reason };
}

/* ── Inside the sale ──────────────────────────────────────────────────── */

export type VoucherTender = { voucherId: string; amount: number };
export type DiscountVoucherUse = { voucherId: string; discount: number };

const cents = (value: number) => Math.round(value * 100) / 100;

/** Why the guarded decrement found nothing to take, read again in the sale's transaction. */
async function shortReason(tx: Tx, voucherId: string, amount: number, today: string, siteId: string): Promise<string> {
  const row = await tx.retailVoucher.findUniqueOrThrow({ where: { id: voucherId }, select: voucherFields });
  const reason = unusableReason(row, { today, siteId });
  if (reason) return reason;
  const left = toNumberOrZero(row.balance);
  return left < amount ? `That voucher has ${formatMoney(left)} left.` : NOTHING_LEFT;
}

/**
 * `redeemInSale`: in the sale's transaction, after the sale row exists. Each
 * money voucher tender takes its amount off with one guarded `UPDATE … WHERE
 * balance >= amount` (0 rows: 409 "That voucher has US$7.40 left." or its
 * reason, and the whole sale rolls back); a discount voucher gives up one use
 * the same way. Each writes its use row and its Activity line.
 */
export async function redeemInSale(
  tx: Tx,
  input: {
    actor: RetailAuditActor;
    sale: { id: string; saleNo: string; siteId: string; at: Date };
    tenders: VoucherTender[];
    discount: DiscountVoucherUse | null;
  },
): Promise<void> {
  const today = voucherToday(input.sale.at);
  const todayDate = dateOf(today);
  for (const tender of input.tenders) {
    const amount = cents(tender.amount);
    const [row] = await tx.$queryRaw<Array<{ balance: Prisma.Decimal; code: string }>>`
      UPDATE "RetailVoucher" SET "balance" = "balance" - ${amount}::numeric, "updatedAt" = NOW()
      WHERE "id" = ${tender.voucherId} AND "companyId" = ${input.actor.companyId}
        AND "kind" <> 'DISCOUNT' AND "balance" >= ${amount}::numeric
        AND "voidedAt" IS NULL AND "expiredAt" IS NULL AND "expiresOn" >= ${todayDate}::date
        AND ("siteId" IS NULL OR "siteId" = ${input.sale.siteId})
      RETURNING "balance", "code"`;
    if (!row) throw new VoucherRefusal(409, await shortReason(tx, tender.voucherId, amount, today, input.sale.siteId));
    const left = toNumberOrZero(row.balance);
    await tx.retailVoucherUse.create({
      data: { companyId: input.actor.companyId, voucherId: tender.voucherId, saleId: input.sale.id, amount, balanceAfter: left, createdAt: input.sale.at },
    });
    await writeRetailAuditEvent(tx, {
      actor: input.actor,
      eventType: RETAIL_AUDIT_EVENTS.voucherRedeemed,
      entityType: "RetailVoucher",
      entityId: tender.voucherId,
      payload: { code: row.code, saleId: input.sale.id, saleNo: input.sale.saleNo, amount: amount.toFixed(2), left: left.toFixed(2) },
    });
  }
  if (input.discount) {
    const [row] = await tx.$queryRaw<Array<{ usesLeft: number; code: string }>>`
      UPDATE "RetailVoucher" SET "usesLeft" = "usesLeft" - 1, "updatedAt" = NOW()
      WHERE "id" = ${input.discount.voucherId} AND "companyId" = ${input.actor.companyId}
        AND "kind" = 'DISCOUNT' AND "usesLeft" > 0
        AND "voidedAt" IS NULL AND "expiredAt" IS NULL AND "expiresOn" >= ${todayDate}::date
        AND ("siteId" IS NULL OR "siteId" = ${input.sale.siteId})
      RETURNING "usesLeft", "code"`;
    if (!row) throw new VoucherRefusal(409, await shortReason(tx, input.discount.voucherId, 0, today, input.sale.siteId));
    const discount = cents(input.discount.discount);
    await tx.retailVoucherUse.create({
      data: { companyId: input.actor.companyId, voucherId: input.discount.voucherId, saleId: input.sale.id, amount: discount, balanceAfter: row.usesLeft, createdAt: input.sale.at },
    });
    await writeRetailAuditEvent(tx, {
      actor: input.actor,
      eventType: RETAIL_AUDIT_EVENTS.voucherRedeemed,
      entityType: "RetailVoucher",
      entityId: input.discount.voucherId,
      payload: { code: row.code, saleId: input.sale.id, saleNo: input.sale.saleNo, amount: discount.toFixed(2), usesLeft: row.usesLeft },
    });
  }
}

/**
 * A refund of a sale paid by voucher puts the money back on it (D-4, FLR-02
 * calls it in the refund's transaction): a negative use row against the
 * refund, the balance up by what comes back, over the sale's voucher payments
 * in order and never more than each paid less what earlier refunds of the
 * same sale put back. Returns what went back.
 */
export async function restoreVoucherUse(tx: Tx, input: { saleId: string; refundSaleId: string; amount: number }): Promise<number> {
  let remaining = cents(input.amount);
  const paid = await tx.retailVoucherUse.findMany({
    where: { saleId: input.saleId, amount: { gt: 0 }, voucher: { kind: { not: "DISCOUNT" } } },
    orderBy: { createdAt: "asc" },
    select: { voucherId: true, amount: true, companyId: true },
  });
  let restored = 0;
  for (const use of paid) {
    if (remaining <= 0) break;
    const back = await tx.retailVoucherUse.aggregate({
      where: { voucherId: use.voucherId, amount: { lt: 0 }, sale: { sourceSaleId: input.saleId } },
      _sum: { amount: true },
    });
    const room = cents(toNumberOrZero(use.amount) + toNumberOrZero(back._sum.amount ?? 0));
    const amount = Math.min(room, remaining);
    if (amount <= 0) continue;
    const voucher = await tx.retailVoucher.update({
      where: { id: use.voucherId },
      data: { balance: { increment: amount } },
      select: { balance: true },
    });
    await tx.retailVoucherUse.create({
      data: { companyId: use.companyId, voucherId: use.voucherId, saleId: input.refundSaleId, amount: -amount, balanceAfter: voucher.balance },
    });
    remaining = cents(remaining - amount);
    restored = cents(restored + amount);
  }
  return restored;
}
