import { Prisma } from "@prisma/client";
import { z } from "zod";

import { reserveIdentifier } from "@/lib/id-generator";
import { recordStockMovement } from "@/lib/inventory/stock-movements";
import { money, multiplyMoney, toBaseAmount, toNumberOrZero } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { listApprovers } from "@/lib/retail/approvers";
import { auditSaleReversed, RETAIL_AUDIT_EVENTS, writeRetailAuditEvent } from "@/lib/retail/audit";
import { getCashNetFromPayments } from "@/lib/retail/cash-up";
import { assignRetailSaleFiscalDay, fiscaliseAfterPosting } from "@/lib/retail/fiscalisation";
import { reversePoints } from "@/lib/retail/loyalty/reverse";
import { approverSchema } from "@/lib/retail/manager-pin";
import { canRetailRoleDo } from "@/lib/retail/permission-matrix";
import { recordRefundEmpties } from "@/lib/retail/stock/empties";
import { checkTillRule, loadTillRules, replayedAt } from "@/lib/retail/till-rules";
import { restoreDiscountUse, restoreVoucherUse } from "@/lib/retail/vouchers/redeem";
import { dayKey, formatMoney, formatTime } from "@/lib/workspace/format";
import { ensureRetailSaleAccountingPosted } from "@/app/api/v2/retail/_services";

import { drawerLabel, resolveDrawer, type DrawerShift } from "./drawer";
import { tillOf } from "./refunds";
import {
  actorName,
  assertSiteOf,
  lockSourceSale,
  OPEN_A_SHIFT_HERE,
  reasonOf,
  reversalApproval,
  ReversalRefused,
  reversalTransaction,
  SALE_NOT_FOUND,
  SHIFT_NO_LONGER_OPEN,
  type ReversalActor,
  type ReversalDevice,
} from "./reversal";
import { hasRefund, paidInSentence, PICK_A_DRAWER, tillShiftClosed, VOID_TODAY_ONLY, voidNote, wasVoided } from "./reversal-words";

/**
 * Void a sale (50-floor W-41, FLR-02): the same day only, the whole sale
 * undone exactly. A VOID document negates it tender by tender in each one's
 * own currency and stamped rate; the stock comes back; the card, wallet or
 * transfer payment is reversed; the cash comes back out of one drawer; what
 * vouchers paid goes back on them and the vouchers it sold are voided with it.
 * The sale and its VOID sum to zero in takings, stock, cash and the journal.
 */

export const voidInput = z.object({
  reason: z.string().min(1, "Pick a reason from the list.").max(240),
  note: z.string().max(500).optional(),
  /** The drawer picked in the sheet (back office). */
  shiftId: z.string().uuid().optional(),
  approver: approverSchema.optional().nullable(),
});

export type VoidInput = z.infer<typeof voidInput>;

const SALE_INCLUDE = {
  lines: { orderBy: { createdAt: "asc" } },
  payments: { orderBy: { createdAt: "asc" } },
  site: { select: { name: true } },
  register: { select: { name: true } },
  shift: { select: { registerName: true } },
  cashier: { select: { name: true } },
} satisfies Prisma.RetailSaleInclude;

type SaleRow = Prisma.RetailSaleGetPayload<{ include: typeof SALE_INCLUDE }>;

/** The sale's own trading day in Harare is today (or the day the till did it, sent in late). */
const sameDay = (saleAt: Date, at: Date) => dayKey(saleAt) === dayKey(at);

async function voidable(actor: ReversalActor, saleId: string, at: Date): Promise<SaleRow> {
  const sale = await prisma.retailSale.findFirst({ where: { id: saleId, companyId: actor.companyId }, include: SALE_INCLUDE });
  if (!sale || sale.saleType === "VOID") throw new ReversalRefused(404, SALE_NOT_FOUND);
  await assertSiteOf(actor, sale.siteId);
  refusesState(sale);
  const reversed = await prisma.retailSale.count({ where: { companyId: actor.companyId, sourceSaleId: sale.id, status: "POSTED" } });
  if (reversed > 0) throw new ReversalRefused(409, hasRefund(sale.saleNo));
  if (!sameDay(sale.postedAt ?? sale.createdAt, at)) throw new ReversalRefused(409, VOID_TODAY_ONLY);
  return sale;
}

function refusesState(sale: Pick<SaleRow, "saleNo" | "saleType" | "status">): void {
  if (sale.saleType !== "SALE") throw new ReversalRefused(409, "Only sales can be voided.");
  if (sale.status === "VOIDED") throw new ReversalRefused(409, wasVoided(sale.saleNo));
  if (sale.status !== "POSTED") throw new ReversalRefused(409, "Only sales can be voided.");
}

/** What the sale left in the drawer, in the base currency: its cash tenders less the change it gave. */
function netCashOf(sale: Pick<SaleRow, "payments" | "changeAmount" | "exchangeRate">): Prisma.Decimal {
  return getCashNetFromPayments(sale.payments, toBaseAmount(sale.changeAmount ?? 0, sale.exchangeRate));
}

/* ── The sheet's form ─────────────────────────────────────────────────── */

export type VoidForm = {
  saleNo: string;
  /** "Today 11:40 · US$44.20 · card". */
  sub: string;
  reasons: string[];
  needsApproval: boolean;
  approval: { canApprove: boolean; name: string; approvers: Array<{ id: string; name: string }> };
  /** The footer for how it was paid. */
  note: string;
  /** Asked only when the sale took cash and its own drawer is closed while several are open. */
  drawer: { choose: Array<{ shiftId: string; label: string }> } | null;
};

export async function voidForm(actor: ReversalActor, saleId: string, now: Date = new Date()): Promise<VoidForm> {
  const sale = await voidable(actor, saleId, now);
  const [rules, approvers] = await Promise.all([loadTillRules(actor.companyId), listApprovers(actor.companyId, ["retail.sell", "approve"])]);
  const till = tillOf(sale);
  let drawer: VoidForm["drawer"] = null;
  if (!netCashOf(sale).isZero()) {
    const choice = await resolveDrawer(prisma, { companyId: actor.companyId, siteId: sale.siteId, registerId: sale.registerId, saleShiftId: sale.shiftId, actorId: actor.userId });
    if ("none" in choice) throw new ReversalRefused(409, tillShiftClosed(till));
    if ("choose" in choice) drawer = { choose: choice.choose.map(({ shiftId, label }) => ({ shiftId, label })) };
  }
  const at = sale.postedAt ?? sale.createdAt;
  return {
    saleNo: sale.saleNo,
    // Only today's sales reach here.
    sub: `Today ${formatTime(at)} · ${formatMoney(toNumberOrZero(sale.totalAmount), sale.currency)} · ${paidInSentence(sale.payments)}`,
    reasons: rules.voidReasons,
    needsApproval: checkTillRule(rules, { act: "void", saleAt: at, at: now }).needsApprover,
    approval: { canApprove: canRetailRoleDo(actor.userRole, "retail.sell", "approve"), name: actorName(actor), approvers },
    note: voidNote(sale.payments.map((payment) => payment.tenderType), till),
    drawer,
  };
}

/* ── The void ─────────────────────────────────────────────────────────── */

async function drawerFor(actor: ReversalActor, sale: SaleRow, body: VoidInput, device: ReversalDevice | null): Promise<DrawerShift | null> {
  if (device) {
    const shift = await prisma.retailShift.findFirst({
      where: { companyId: actor.companyId, registerId: device.registerId, cashierId: actor.userId, status: "OPEN" },
      select: { id: true, shiftNo: true, siteId: true, registerId: true, registerCode: true, registerName: true, cashierId: true, cashierName: true, openedAt: true },
    });
    if (!shift) throw new ReversalRefused(409, OPEN_A_SHIFT_HERE);
    if (shift.siteId !== sale.siteId) throw new ReversalRefused(409, "This sale was rung at another site. Void it there.");
    return shift;
  }
  const cash = !netCashOf(sale).isZero();
  const choice = await resolveDrawer(prisma, {
    companyId: actor.companyId,
    siteId: sale.siteId,
    registerId: sale.registerId,
    saleShiftId: sale.shiftId,
    chosenShiftId: cash ? body.shiftId : undefined,
    actorId: actor.userId,
  });
  if ("shift" in choice) return choice.shift;
  if (!cash) return null;
  if ("choose" in choice) throw new ReversalRefused(409, PICK_A_DRAWER, undefined, { choose: choice.choose });
  throw new ReversalRefused(409, tillShiftClosed(tillOf(sale)));
}

export async function voidSale(input: {
  actor: ReversalActor;
  saleId: string;
  body: VoidInput;
  device?: ReversalDevice | null;
  /** Done offline and sent in late: when the till says it was done. */
  offlineAt?: Date | null;
  periodOverrideReason?: string | null;
}) {
  const { actor, body } = input;
  const device = input.device ?? null;
  const arrived = new Date();
  // Same day is judged on when it was done: a void the till did offline yesterday evening is yesterday's.
  const sale = await voidable(actor, input.saleId, input.offlineAt ?? arrived);
  const rules = await loadTillRules(actor.companyId);
  const { reason, review: reasonReview } = reasonOf(rules, "void", body.reason, Boolean(input.offlineAt));
  const saleAt = sale.postedAt ?? sale.createdAt;
  // "Voids need a manager PIN" is judged at arrival: a replayed void dated back inside the free minutes is no way round it.
  const { approvedBy, review: approvalReview } = await reversalApproval(
    { actor, approver: body.approver, offlineAt: input.offlineAt, deviceId: device?.id ?? null },
    { decision: checkTillRule(rules, { act: "void", saleAt, at: arrived }), kind: "void" },
  );
  const drawer = await drawerFor(actor, sale, body, device);
  const when = input.offlineAt
    ? replayedAt(input.offlineAt, { saleAt, shiftOpenedAt: drawer?.openedAt ?? saleAt }, arrived)
    : { at: arrived, review: null };
  const voidNo = await reserveIdentifier(prisma, { companyId: actor.companyId, entity: "RETAIL_VOID" });
  const auditActor = { companyId: actor.companyId, userId: actor.userId, userName: actor.userName ?? null, userRole: actor.userRole ?? null };

  const { fiscal: assigned, ...created } = await reversalTransaction(async (tx) => {
    // One reversal of a sale at a time, so a void and a refund cannot both read "nothing reversed yet".
    await lockSourceSale(tx, sale.id);
    const current = await tx.retailSale.findFirst({
      where: { id: sale.id, companyId: actor.companyId },
      include: { lines: { orderBy: { createdAt: "asc" } }, payments: { orderBy: { createdAt: "asc" } } },
    });
    if (!current) throw new ReversalRefused(404, SALE_NOT_FOUND);
    refusesState(current);
    const reversed = await tx.retailSale.count({ where: { companyId: actor.companyId, sourceSaleId: current.id, status: "POSTED" } });
    if (reversed > 0) throw new ReversalRefused(409, hasRefund(current.saleNo));

    // Gift vouchers it sold go with it, unless any of their money was spent.
    const sold = await tx.retailVoucher.findMany({
      where: { companyId: actor.companyId, soldSaleId: current.id },
      select: { id: true, code: true, value: true, balance: true, voidedAt: true },
    });
    const used = sold.find((voucher) => voucher.voidedAt || !money(voucher.balance).equals(money(voucher.value ?? 0)));
    if (used) throw new ReversalRefused(409, `${used.code} has been used. Refund it instead.`);

    // Each tender back in its own currency at the rate stamped on it, the change back into the drawer.
    const reversedPayments = current.payments.map((payment) => ({
      tenderType: payment.tenderType,
      amount: money(payment.amount).negated(),
      currency: payment.currency,
      exchangeRate: payment.exchangeRate,
      baseAmount: money(payment.baseAmount).negated(),
      reference: ["CARD", "ECOCASH", "INNBUCKS", "TRANSFER"].includes(payment.tenderType)
        ? `Reversal of ${payment.reference?.trim() || current.saleNo}`
        : payment.reference?.trim() || null,
      voucherId: payment.voucherId,
    }));

    const voidDoc = await tx.retailSale.create({
      data: {
        companyId: actor.companyId,
        saleNo: voidNo,
        shiftId: drawer?.id ?? null,
        registerId: drawer?.registerId ?? null,
        deviceId: device?.id ?? null,
        sourceSaleId: current.id,
        siteId: current.siteId,
        cashierId: actor.userId,
        cashierName: actorName(actor),
        customerName: current.customerName,
        customerId: current.customerId,
        saleType: "VOID",
        subtotal: money(current.subtotal).abs().negated(),
        discountAmount: money(current.discountAmount).abs().negated(),
        taxAmount: money(current.taxAmount).abs().negated(),
        totalAmount: money(current.totalAmount).abs().negated(),
        depositAmount: money(current.depositAmount).negated(),
        vouchersSoldAmount: money(current.vouchersSoldAmount).negated(),
        tenderedAmount: current.tenderedAmount == null ? null : money(current.tenderedAmount).negated(),
        changeAmount: current.changeAmount == null ? null : money(current.changeAmount).negated(),
        changeZig: money(current.changeZig).negated(),
        currency: current.currency,
        exchangeRate: current.exchangeRate,
        baseAmount: toBaseAmount(money(current.totalAmount).abs().negated(), current.exchangeRate),
        overrideReason: reason,
        approvedById: approvedBy?.id ?? null,
        approvedByName: approvedBy?.name ?? null,
        reviewReason: [approvalReview, reasonReview, when.review].filter(Boolean).join(" ") || null,
        status: "POSTED",
        notes: body.note?.trim() || null,
        postedAt: when.at,
        tenderSummary: reversedPayments.map((payment) => ({
          tenderType: payment.tenderType,
          amount: toNumberOrZero(payment.amount),
          currency: payment.currency,
          exchangeRate: payment.exchangeRate.toString(),
          baseAmount: toNumberOrZero(payment.baseAmount),
        })),
        lines: {
          create: current.lines.map((line) => ({
            companyId: actor.companyId,
            sourceLineId: line.id,
            inventoryItemId: line.inventoryItemId,
            productId: line.productId,
            itemName: line.itemName,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            discountAmount: money(line.discountAmount).abs().negated(),
            taxAmount: money(line.taxAmount).abs().negated(),
            lineTotal: money(line.lineTotal).abs().negated(),
            costUnit: money(line.costUnit),
            costTotal: money(line.costTotal).isZero() ? multiplyMoney(money(line.quantity).abs(), money(line.costUnit)) : money(line.costTotal),
            depositAmount: money(line.depositAmount).negated(),
          })),
        },
        payments: { create: reversedPayments.map((payment) => ({ companyId: actor.companyId, ...payment })) },
      },
      include: { lines: true, payments: true },
    });

    // PRD-10: what vouchers paid goes back on them, and a discount voucher gets its use back.
    const reversal = { actor: auditActor, saleId: current.id, reversalSaleId: voidDoc.id, reversalSaleNo: voidDoc.saleNo, at: when.at };
    await restoreVoucherUse(tx, reversal);
    if (current.discountVoucherId) await restoreDiscountUse(tx, { ...reversal, voucherId: current.discountVoucherId });
    // The vouchers it sold are voided with no journal of their own: the VOID's
    // reversal of `vouchersSoldAmount` already takes them off Vouchers owed.
    for (const voucher of sold) {
      await tx.retailVoucher.update({ where: { id: voucher.id }, data: { voidedAt: when.at, voidedById: actor.userId, voidReason: reason } });
      await writeRetailAuditEvent(tx, {
        actor: auditActor,
        eventType: RETAIL_AUDIT_EVENTS.voucherVoided,
        entityType: "RetailVoucher",
        entityId: voucher.id,
        reason,
        payload: { code: voucher.code, reason, left: money(voucher.balance).toFixed(2), saleNo: voidDoc.saleNo },
      });
    }

    for (const line of current.lines) {
      const item = await tx.inventoryItem.findUniqueOrThrow({ where: { id: line.inventoryItemId }, select: { id: true, unit: true, unitCost: true } });
      await recordStockMovement({
        companyId: actor.companyId,
        userId: actor.userId,
        itemId: item.id,
        movementType: "RECEIPT",
        quantity: line.quantity,
        unit: item.unit,
        unitCost: item.unitCost ?? 0,
        notes: `Retail sale void ${voidDoc.saleNo}`,
        sourceType: "RETAIL_VOID",
        reason: "VOID",
        reference: voidDoc.saleNo,
        sourceId: `${voidDoc.id}:${item.id}`,
        entryDate: when.at,
        tx,
      });
    }

    // What the sale left in the drawer, taken back out of exactly one drawer.
    const netCash = getCashNetFromPayments(voidDoc.payments, toBaseAmount(voidDoc.changeAmount ?? 0, voidDoc.exchangeRate));
    if (!netCash.isZero()) {
      const moved = await tx.retailShift.updateMany({
        where: { id: drawer!.id, companyId: actor.companyId, status: "OPEN" },
        data: { expectedCash: { increment: netCash } },
      });
      if (moved.count !== 1) throw new ReversalRefused(409, SHIFT_NO_LONGER_OPEN);
    }

    await tx.retailSale.update({
      where: { id: current.id },
      data: { status: "VOIDED", voidReason: reason, approvedById: approvedBy?.id ?? null, approvedByName: approvedBy?.name ?? null, notes: body.note?.trim() || current.notes },
    });

    // CUS-01: a void takes back everything the sale earned and gives back everything it spent.
    await reversePoints(tx, { saleId: current.id, reversalSaleId: voidDoc.id, share: 1, actor: { id: actor.userId, name: actorName(actor) }, at: when.at });

    // STK-09: the whole deposit handed back, on the Empties ledger.
    await recordRefundEmpties(tx, {
      companyId: actor.companyId,
      siteId: voidDoc.siteId,
      saleId: voidDoc.id,
      saleNo: voidDoc.saleNo,
      customerId: current.customerId,
      createdById: actor.userId,
      depositAmount: voidDoc.depositAmount,
    });

    await auditSaleReversed(tx, {
      actor,
      kind: "void",
      saleId: voidDoc.id,
      saleNo: voidDoc.saleNo,
      sourceSaleId: current.id,
      sourceSaleNo: current.saleNo,
      shiftId: voidDoc.shiftId,
      totalAmount: voidDoc.totalAmount,
      currency: voidDoc.currency,
      reason,
      approvedBy,
    });

    // Last: its fiscal day, settled in this commit (SET-08).
    const fiscal = await assignRetailSaleFiscalDay(tx, { companyId: actor.companyId, saleId: voidDoc.id });
    return { ...voidDoc, fiscal };
  });

  const accounting = await ensureRetailSaleAccountingPosted({
    actor,
    sale: created,
    registerCode: drawer?.registerCode ?? null,
    periodOverrideReason: input.periodOverrideReason ?? null,
  });
  const fiscal = await fiscaliseAfterPosting({ companyId: actor.companyId, saleId: created.id, assigned });
  return { saleNo: sale.saleNo, voidNo: created.saleNo, sale: created, accounting, fiscal, drawer: drawer ? drawerLabel(drawer) : null };
}
