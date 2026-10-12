import { Prisma, type RetailTenderType } from "@prisma/client";
import { z } from "zod";

import { reserveIdentifier } from "@/lib/id-generator";
import { recordStockMovement } from "@/lib/inventory/stock-movements";
import { ZERO, money, multiplyMoney, rate, sumMoney, toBaseAmount, toNumberOrZero } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { listApprovers } from "@/lib/retail/approvers";
import { auditSaleReversed } from "@/lib/retail/audit";
import { depositBack } from "@/lib/retail/deposits";
import { assignRetailSaleFiscalDay, fiscaliseAfterPosting } from "@/lib/retail/fiscalisation";
import { reversePoints } from "@/lib/retail/loyalty/reverse";
import { approverSchema } from "@/lib/retail/manager-pin";
import { canRetailRoleDo } from "@/lib/retail/permission-matrix";
import { reversalSubtotal } from "@/lib/retail/sale-totals";
import { adjustmentJournal, writeOffInTx, type AdjustResult } from "@/lib/retail/stock/adjustments";
import { recordRefundEmpties } from "@/lib/retail/stock/empties";
import { checkTillRule, loadTillRules, replayedAt } from "@/lib/retail/till-rules";
import { addMonths, voucherToday } from "@/lib/retail/vouchers/dates";
import { issueCreditNote, issueVoucher } from "@/lib/retail/vouchers/issue";
import { restoreVoucherUse } from "@/lib/retail/vouchers/redeem";
import { dayKey, formatMediumDay, formatTime, todayIn } from "@/lib/workspace/format";
import { ensureRetailSaleAccountingPosted } from "@/app/api/v2/retail/_services";
import { postRetailJournal } from "@/app/api/v2/retail/_helpers";

import { drawerHint, drawerLabel, noDrawer, resolveDrawer, type DrawerShift } from "./drawer";
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
import {
  CHOOSE_WHAT_COMES_BACK,
  CREDIT_NOTE_NEEDS_CUSTOMER,
  NOT_ORIGINAL,
  onlyLeftSentence,
  ORIGINAL_TENDERS,
  originalLabel,
  paidInSentence,
  PICK_A_DRAWER,
  TO_LABELS,
  wasVoided,
  type RefundDone,
  type RefundTo,
} from "./reversal-words";

/**
 * Refund a sale (50-floor W-41, FLR-02): the one refund the back office's
 * sheet and the till's History both post. What comes back is chosen line by
 * line (never more than is left of a line); the money goes back on the card
 * or wallet it was paid with, in cash out of one drawer, as a credit note or
 * as a gift voucher; the goods go back on the shelf or, damaged, are written
 * off and show in Losses. Over the till rules' limit (on the sale's refunds
 * together) a manager approves it.
 */

export const refundInput = z.object({
  lines: z
    .array(z.object({ saleLineId: z.string().uuid(), quantity: z.string().regex(/^\d+(\.\d{1,4})?$/, CHOOSE_WHAT_COMES_BACK) }))
    .min(1, CHOOSE_WHAT_COMES_BACK),
  reason: z.string().min(1, "Pick a reason from the list.").max(240),
  to: z.enum(["ORIGINAL", "CASH", "CREDIT_NOTE", "VOUCHER"], { message: "Say how the money goes back." }),
  restock: z.boolean().default(true),
  customerId: z.string().uuid("Pick one of this shop's customers.").optional(),
  /** The drawer picked in the sheet (back office). */
  shiftId: z.string().uuid().optional(),
  approver: approverSchema.optional().nullable(),
  notes: z.string().max(500).optional(),
});

export type RefundInput = z.infer<typeof refundInput>;

const SALE_INCLUDE = {
  lines: { orderBy: { createdAt: "asc" } },
  payments: { orderBy: { createdAt: "asc" } },
  site: { select: { name: true } },
  register: { select: { name: true } },
  shift: { select: { registerName: true } },
  cashier: { select: { name: true } },
  customer: { select: { id: true, name: true } },
} satisfies Prisma.RetailSaleInclude;

type SaleRow = Prisma.RetailSaleGetPayload<{ include: typeof SALE_INCLUDE }>;

async function saleFor(actor: ReversalActor, saleId: string): Promise<SaleRow> {
  const sale = await prisma.retailSale.findFirst({ where: { id: saleId, companyId: actor.companyId }, include: SALE_INCLUDE });
  if (!sale || sale.saleType === "VOID") throw new ReversalRefused(404, SALE_NOT_FOUND);
  await assertSiteOf(actor, sale.siteId);
  return sale;
}

function refusesState(sale: Pick<SaleRow, "saleNo" | "saleType" | "status">): void {
  if (sale.saleType !== "SALE") throw new ReversalRefused(409, "Only sales can be refunded.");
  if (sale.status === "VOIDED") throw new ReversalRefused(409, wasVoided(sale.saleNo));
  if (sale.status !== "POSTED") throw new ReversalRefused(409, "Only sales can be refunded.");
}

/** The one tender a refund can go back on as it was paid, or null. */
function originalTender(payments: ReadonlyArray<{ tenderType: RetailTenderType }>): RetailTenderType | null {
  if (payments.length !== 1) return null;
  const tender = payments[0]!.tenderType;
  return (ORIGINAL_TENDERS as readonly string[]).includes(tender) ? tender : null;
}

type PriorLine = {
  sourceLineId: string | null;
  quantity: Prisma.Decimal;
  depositAmount: Prisma.Decimal;
  lineTotal: Prisma.Decimal;
  taxAmount: Prisma.Decimal;
  discountAmount: Prisma.Decimal;
  costTotal: Prisma.Decimal;
};
type Prior = { saleType: string; totalAmount: Prisma.Decimal; depositAmount: Prisma.Decimal; lines: PriorLine[] };

/** What earlier refunds and voids took off each source line, by amount. */
type LineBack = { quantity: Prisma.Decimal; deposit: Prisma.Decimal; lineTotal: Prisma.Decimal; taxAmount: Prisma.Decimal; discountAmount: Prisma.Decimal; costTotal: Prisma.Decimal };

function backSoFar(prior: Prior[]) {
  const lines = new Map<string, LineBack>();
  for (const line of prior.flatMap((sale) => sale.lines)) {
    if (!line.sourceLineId) continue;
    const so = lines.get(line.sourceLineId) ?? { quantity: ZERO, deposit: ZERO, lineTotal: ZERO, taxAmount: ZERO, discountAmount: ZERO, costTotal: ZERO };
    lines.set(line.sourceLineId, {
      quantity: so.quantity.plus(rate(line.quantity).abs()),
      deposit: so.deposit.plus(money(line.depositAmount).abs()),
      lineTotal: so.lineTotal.plus(money(line.lineTotal).abs()),
      taxAmount: so.taxAmount.plus(money(line.taxAmount).abs()),
      discountAmount: so.discountAmount.plus(money(line.discountAmount).abs()),
      costTotal: so.costTotal.plus(money(line.costTotal).abs()),
    });
  }
  const refunded = sumMoney(
    prior.filter((sale) => sale.saleType === "REFUND").map((sale) => money(sale.totalAmount).abs().plus(money(sale.depositAmount).abs())),
  );
  return { lines, refunded };
}

/** A take's share of a line amount: the ratio for a part, exactly what is left for the rest. */
function shareOf(whole: Prisma.Decimal, already: Prisma.Decimal, ratio: Prisma.Decimal, takesRest: boolean): Prisma.Decimal {
  if (!takesRest) return multiplyMoney(whole, ratio);
  const rest = money(whole.minus(already));
  return rest.isNegative() ? ZERO : rest;
}

const priorWhere = (companyId: string, saleId: string) => ({
  companyId,
  sourceSaleId: saleId,
  saleType: { in: ["REFUND", "VOID"] as Array<"REFUND" | "VOID"> },
  status: "POSTED" as const,
});

/* ── The sheet's form ─────────────────────────────────────────────────── */

export type RefundForm = {
  saleNo: string;
  /** "Front till · Chipo Dube · today 11:40 · card". */
  sub: string;
  /** Only lines with something left. `price` is each one's share of the line; `deposit` each one's deposit back. */
  lines: Array<{ saleLineId: string; name: string; bought: number; left: number; price: string; deposit: string }>;
  reasons: string[];
  to: Array<{ value: RefundTo; label: string }>;
  drawer: { shiftId: string; label: string; hint: string } | { choose: Array<{ shiftId: string; label: string }> } | null;
  /** "Open a shift at Harare Main Branch to hand cash back.", while no drawer is open at the site. */
  noDrawer: string;
  pinOver: string;
  /** What earlier refunds of the sale gave back, in the base currency: the limit is on them together. */
  alreadyRefunded: string;
  currency: string;
  approval: { canApprove: boolean; name: string; approvers: Array<{ id: string; name: string }> };
  customer: { id: string; name: string } | null;
};

export function saleSub(sale: Pick<SaleRow, "postedAt" | "createdAt" | "payments"> & { till: string; cashier: string }, now: Date = new Date()): string {
  const at = sale.postedAt ?? sale.createdAt;
  const day = dayKey(at) === todayIn(undefined, now) ? "today" : formatMediumDay(at);
  return `${sale.till} · ${sale.cashier} · ${day} ${formatTime(at)} · ${paidInSentence(sale.payments)}`;
}

export const tillOf = (sale: Pick<SaleRow, "register" | "shift">) => sale.register?.name ?? sale.shift?.registerName ?? "Back office";

export async function refundForm(actor: ReversalActor, saleId: string): Promise<RefundForm> {
  const sale = await saleFor(actor, saleId);
  refusesState(sale);
  const [rules, prior, approvers, choice] = await Promise.all([
    loadTillRules(actor.companyId),
    prisma.retailSale.findMany({ where: priorWhere(actor.companyId, sale.id), include: { lines: true } }),
    listApprovers(actor.companyId, ["retail.sell", "approve"]),
    resolveDrawer(prisma, {
      companyId: actor.companyId,
      siteId: sale.siteId,
      registerId: sale.registerId,
      saleShiftId: sale.shiftId,
      actorId: actor.userId,
    }),
  ]);
  const back = backSoFar(prior);
  const lines = sale.lines.flatMap((line) => {
    const bought = rate(line.quantity).abs();
    const left = bought.minus(back.lines.get(line.id)?.quantity ?? ZERO);
    if (left.lessThanOrEqualTo(0)) return [];
    const depositLeft = money(line.depositAmount).abs().minus(back.lines.get(line.id)?.deposit ?? ZERO);
    return [
      {
        saleLineId: line.id,
        name: line.itemName,
        bought: bought.toNumber(),
        left: left.toNumber(),
        price: bought.isZero() ? "0.00" : money(line.lineTotal).abs().dividedBy(bought).toFixed(2),
        deposit: depositLeft.lessThanOrEqualTo(0) ? "0.00" : depositLeft.dividedBy(left).toFixed(4),
      },
    ];
  });
  if (lines.length === 0) throw new ReversalRefused(409, `Everything on ${sale.saleNo} has come back already.`);
  const tender = originalTender(sale.payments);
  return {
    saleNo: sale.saleNo,
    sub: saleSub({ ...sale, till: tillOf(sale), cashier: sale.cashier?.name ?? sale.cashierName ?? "—" }),
    lines,
    reasons: rules.refundReasons,
    to: [
      ...(tender ? [{ value: "ORIGINAL" as const, label: originalLabel(tender) }] : []),
      ...(Object.entries(TO_LABELS) as Array<[Exclude<RefundTo, "ORIGINAL">, string]>).map(([value, label]) => ({ value, label })),
    ],
    drawer:
      "shift" in choice
        ? { shiftId: choice.shift.id, label: drawerLabel(choice.shift), hint: drawerHint(choice.shift) }
        : "choose" in choice
          ? { choose: choice.choose.map(({ shiftId, label }) => ({ shiftId, label })) }
          : null,
    noDrawer: noDrawer(sale.site.name, "hand cash back"),
    pinOver: rules.refundPinOver.toFixed(2),
    alreadyRefunded: toBaseAmount(back.refunded, sale.exchangeRate).toFixed(2),
    currency: sale.currency,
    approval: {
      canApprove: canRetailRoleDo(actor.userRole, "retail.sell", "approve"),
      name: actorName(actor),
      approvers,
    },
    customer: sale.customer ? { id: sale.customer.id, name: sale.customer.name } : null,
  };
}

/* ── The refund ───────────────────────────────────────────────────────── */

export type RefundResult = RefundDone & {
  sale: Awaited<ReturnType<typeof writeRefund>>["created"];
  accounting: Awaited<ReturnType<typeof ensureRetailSaleAccountingPosted>>;
  fiscal: Awaited<ReturnType<typeof fiscaliseAfterPosting>>;
};

/** The drawer the refund sits on, and whether its cash comes out of it. */
async function drawerFor(
  actor: ReversalActor,
  sale: SaleRow,
  body: RefundInput,
  device: ReversalDevice | null,
): Promise<DrawerShift | null> {
  if (device) {
    // At the till: the cashier's own open shift on it, as the money comes out of its drawer.
    const shift = await prisma.retailShift.findFirst({
      where: { companyId: actor.companyId, registerId: device.registerId, cashierId: actor.userId, status: "OPEN" },
      select: { id: true, shiftNo: true, siteId: true, registerId: true, registerCode: true, registerName: true, cashierId: true, cashierName: true, openedAt: true },
    });
    if (!shift) throw new ReversalRefused(409, OPEN_A_SHIFT_HERE);
    if (shift.siteId !== sale.siteId) throw new ReversalRefused(409, "This sale was rung at another site. Refund it there.");
    return shift;
  }
  const choice = await resolveDrawer(prisma, {
    companyId: actor.companyId,
    siteId: sale.siteId,
    registerId: sale.registerId,
    saleShiftId: sale.shiftId,
    chosenShiftId: body.to === "CASH" ? body.shiftId : undefined,
    actorId: actor.userId,
  });
  if ("shift" in choice) return choice.shift;
  if (body.to !== "CASH") return null;
  if ("choose" in choice) throw new ReversalRefused(409, PICK_A_DRAWER, undefined, { choose: choice.choose });
  throw new ReversalRefused(409, noDrawer(sale.site.name, "hand cash back"));
}

export async function refundSale(input: {
  actor: ReversalActor;
  saleId: string;
  body: RefundInput;
  /** The till it is done at (SET-04); none in the back office. */
  device?: ReversalDevice | null;
  /** Done offline and sent in late: when the till says it was done (kept as today). */
  offlineAt?: Date | null;
  periodOverrideReason?: string | null;
}): Promise<RefundResult> {
  const { actor, body } = input;
  const device = input.device ?? null;
  const sale = await saleFor(actor, input.saleId);
  refusesState(sale);
  const rules = await loadTillRules(actor.companyId);
  const replay = Boolean(input.offlineAt);
  const { reason, review: reasonReview } = reasonOf(rules, "refund", body.reason, replay);

  const requested = new Map<string, Prisma.Decimal>();
  for (const line of body.lines) {
    if (!sale.lines.some((entry) => entry.id === line.saleLineId)) throw new ReversalRefused(400, CHOOSE_WHAT_COMES_BACK, { lines: CHOOSE_WHAT_COMES_BACK });
    requested.set(line.saleLineId, (requested.get(line.saleLineId) ?? ZERO).plus(line.quantity));
  }
  if ([...requested.values()].some((quantity) => quantity.lessThanOrEqualTo(0))) {
    throw new ReversalRefused(400, CHOOSE_WHAT_COMES_BACK, { lines: CHOOSE_WHAT_COMES_BACK });
  }

  const tender = originalTender(sale.payments);
  if (body.to === "ORIGINAL" && !tender) throw new ReversalRefused(400, NOT_ORIGINAL, { to: NOT_ORIGINAL });
  let customerId = sale.customerId;
  if (body.customerId && body.customerId !== sale.customerId) {
    const customer = await prisma.customer.findFirst({ where: { id: body.customerId, companyId: actor.companyId }, select: { id: true } });
    if (!customer) throw new ReversalRefused(400, "Pick one of this shop's customers.", { customer: "Pick one of this shop's customers." });
    customerId = sale.customerId ?? customer.id;
  }
  if (body.to === "CREDIT_NOTE" && !customerId) {
    throw new ReversalRefused(400, CREDIT_NOTE_NEEDS_CUSTOMER, { customer: CREDIT_NOTE_NEEDS_CUSTOMER });
  }

  const drawer = await drawerFor(actor, sale, body, device);
  const refundNo = await reserveIdentifier(prisma, { companyId: actor.companyId, entity: "RETAIL_REFUND" });
  const arrived = new Date();
  const saleAt = sale.postedAt ?? sale.createdAt;
  const when = input.offlineAt
    ? replayedAt(input.offlineAt, { saleAt, shiftOpenedAt: drawer?.openedAt ?? saleAt }, arrived)
    : { at: arrived, review: null };

  const written = await writeRefund({
    actor,
    sale,
    body,
    reason,
    reviews: [reasonReview, when.review],
    requested,
    tender,
    customerId,
    drawer,
    device,
    offlineAt: input.offlineAt ?? null,
    refundNo,
    at: when.at,
  });

  const accounting = await ensureRetailSaleAccountingPosted({
    actor,
    sale: written.created,
    registerCode: drawer?.registerCode ?? null,
    periodOverrideReason: input.periodOverrideReason ?? null,
  });
  // The damaged goods' loss at cost (Dr Breakage / Cr Stock), as Adjust stock posts it.
  for (const writeOff of written.writeOffs) {
    const journal = adjustmentJournal(writeOff, actor);
    if (journal) await postRetailJournal(journal);
  }
  // Its credit note, signed in its commit (SET-08), goes to ZIMRA now; it cites the original receipt.
  const fiscal = await fiscaliseAfterPosting({ companyId: actor.companyId, saleId: written.created.id, assigned: written.fiscal });

  return {
    id: written.created.id,
    saleNo: written.created.saleNo,
    value: written.value.toFixed(2),
    currency: sale.currency,
    to: body.to,
    tender: body.to === "ORIGINAL" ? tender : null,
    till: body.to === "CASH" ? (drawer?.registerName ?? null) : null,
    voucherCode: written.voucherCode,
    sale: written.created,
    accounting,
    fiscal,
  };
}

async function writeRefund(input: {
  actor: ReversalActor;
  sale: SaleRow;
  body: RefundInput;
  reason: string;
  reviews: Array<string | null>;
  requested: Map<string, Prisma.Decimal>;
  tender: RetailTenderType | null;
  customerId: string | null;
  drawer: DrawerShift | null;
  device: ReversalDevice | null;
  offlineAt: Date | null;
  refundNo: string;
  at: Date;
}) {
  const { actor, body } = input;
  return reversalTransaction(async (tx) => {
    // One reversal of a sale at a time: the earlier refunds below are read
    // after any running one has committed, so they are judged together.
    await lockSourceSale(tx, input.sale.id);
    const sale = await tx.retailSale.findFirst({
      where: { id: input.sale.id, companyId: actor.companyId },
      include: { lines: true, payments: { orderBy: { createdAt: "asc" } } },
    });
    if (!sale) throw new ReversalRefused(404, SALE_NOT_FOUND);
    refusesState(sale);
    const prior = await tx.retailSale.findMany({ where: priorWhere(actor.companyId, sale.id), include: { lines: true } });
    const back = backSoFar(prior);

    // Quantities are `Decimal(12,4)` and money `Decimal(14,2)`, so the whole
    // apportionment runs in `Decimal` and rounds once per amount. The ratio is
    // left unrounded: rounding it first is how a refund of every line stops
    // adding up to the sale it reverses.
    const lines = [...input.requested.entries()].map(([saleLineId, quantity]) => {
      const source = sale.lines.find((line) => line.id === saleLineId)!;
      const bought = rate(source.quantity).abs();
      const so = back.lines.get(source.id);
      const leftRaw = bought.minus(so?.quantity ?? ZERO);
      const left = leftRaw.isNegative() ? ZERO : leftRaw;
      if (quantity.greaterThan(left)) {
        const message = onlyLeftSentence(source.itemName, left.toNumber());
        throw new ReversalRefused(400, message, { lines: message });
      }
      const ratio = bought.isZero() ? ZERO : quantity.div(bought);
      // The take that empties the line gets exactly what earlier takes left, so the
      // sale and all its refunds net to zero in takings, VAT and the journal.
      const takesRest = quantity.equals(left);
      const costUnit = money(source.costUnit).abs();
      const wholeCost = money(source.costTotal).isZero() ? multiplyMoney(bought, costUnit) : money(source.costTotal).abs();
      // Bottles back with the goods: the line's deposit comes back with them, the last refund exactly what is left.
      const deposit = depositBack(
        {
          quantity: toNumberOrZero(bought),
          depositAmount: toNumberOrZero(source.depositAmount),
          depositRefunded: toNumberOrZero(so?.deposit ?? ZERO),
        },
        toNumberOrZero(quantity),
        toNumberOrZero(left),
      );
      return {
        source,
        quantity,
        discountAmount: shareOf(money(source.discountAmount).abs(), so?.discountAmount ?? ZERO, ratio, takesRest).negated(),
        taxAmount: shareOf(money(source.taxAmount).abs(), so?.taxAmount ?? ZERO, ratio, takesRest).negated(),
        lineTotal: shareOf(money(source.lineTotal).abs(), so?.lineTotal ?? ZERO, ratio, takesRest).negated(),
        costUnit,
        costTotal: shareOf(wholeCost, so?.costTotal ?? ZERO, ratio, takesRest),
        depositAmount: money(deposit).negated(),
      };
    });

    const subtotal = reversalSubtotal(lines);
    const discountAmount = sumMoney(lines.map((line) => line.discountAmount));
    const taxAmount = sumMoney(lines.map((line) => line.taxAmount));
    const totalAmount = sumMoney(lines.map((line) => line.lineTotal));
    const depositAmount = sumMoney(lines.map((line) => line.depositAmount));
    // The goods and their bottles' deposits: what the customer gets back.
    const value = totalAmount.abs().plus(depositAmount.abs());

    const decision = checkTillRule(await loadTillRules(actor.companyId, tx), {
      act: "refund",
      amount: toBaseAmount(value, sale.exchangeRate),
      alreadyRefunded: toBaseAmount(back.refunded, sale.exchangeRate),
    });
    const { approvedBy, review: approvalReview } = await reversalApproval(
      { actor, approver: body.approver, offlineAt: input.offlineAt, deviceId: input.device?.id ?? null },
      { decision, kind: "refund" },
    );

    const original = input.tender ? sale.payments[0]! : null;
    const tenderType: RetailTenderType = body.to === "ORIGINAL" ? input.tender! : body.to === "CASH" ? "CASH" : "VOUCHER";
    const created = await tx.retailSale.create({
      data: {
        companyId: actor.companyId,
        saleNo: input.refundNo,
        shiftId: input.drawer?.id ?? null,
        registerId: input.drawer?.registerId ?? null,
        deviceId: input.device?.id ?? null,
        sourceSaleId: sale.id,
        siteId: sale.siteId,
        cashierId: actor.userId,
        cashierName: actorName(actor),
        customerName: sale.customerName,
        customerId: input.customerId,
        saleType: "REFUND",
        subtotal,
        discountAmount,
        taxAmount,
        totalAmount,
        depositAmount,
        tenderedAmount: value.negated(),
        changeAmount: 0,
        // A refund is denominated by the sale it reverses, at its rate.
        currency: sale.currency,
        exchangeRate: sale.exchangeRate,
        baseAmount: toBaseAmount(totalAmount, sale.exchangeRate),
        overrideReason: input.reason,
        approvedById: approvedBy?.id ?? null,
        approvedByName: approvedBy?.name ?? null,
        restocked: body.restock,
        reviewReason: [approvalReview, ...input.reviews].filter(Boolean).join(" ") || null,
        status: "POSTED",
        notes: body.notes?.trim() || null,
        postedAt: input.at,
        tenderSummary: [{ tenderType, amount: toNumberOrZero(value.negated()), currency: sale.currency }],
        lines: {
          create: lines.map((line) => ({
            companyId: actor.companyId,
            sourceLineId: line.source.id,
            inventoryItemId: line.source.inventoryItemId,
            productId: line.source.productId,
            itemName: line.source.itemName,
            quantity: line.quantity,
            unitPrice: line.source.unitPrice,
            discountAmount: line.discountAmount,
            taxAmount: line.taxAmount,
            lineTotal: line.lineTotal,
            costUnit: line.costUnit,
            costTotal: line.costTotal,
            depositAmount: line.depositAmount,
          })),
        },
      },
    });

    // The money back: one negative payment of exactly the value.
    let voucherId: string | null = null;
    let voucherCode: string | null = null;
    const auditActor = { companyId: actor.companyId, userId: actor.userId, userName: actor.userName ?? null, userRole: actor.userRole ?? null };
    if (body.to === "CREDIT_NOTE") {
      const note = await issueCreditNote(tx, { actor: auditActor, sourceSaleId: created.id, value: value.toFixed(2), customerId: input.customerId, now: input.at });
      voucherId = note.id;
      voucherCode = note.code;
    } else if (body.to === "VOUCHER") {
      const gift = await issueVoucher(tx, {
        actor: auditActor,
        kind: "GIFT",
        funding: "REFUND",
        valueCents: Math.round(value.times(100).toNumber()),
        customerId: input.customerId,
        expiresOn: addMonths(voucherToday(input.at), 12),
        sendBy: "PRINT",
        soldSaleId: created.id,
        issuedAt: input.at,
      });
      voucherId = gift.id;
      voucherCode = gift.code;
    } else if (body.to === "ORIGINAL" && original?.tenderType === "VOUCHER") {
      voucherId = original.voucherId;
      await restoreVoucherUse(tx, {
        actor: auditActor,
        saleId: sale.id,
        reversalSaleId: created.id,
        reversalSaleNo: created.saleNo,
        at: input.at,
        amount: toNumberOrZero(value),
      });
    }
    if (!value.isZero()) {
      await tx.retailSalePayment.create({
        data: {
          companyId: actor.companyId,
          saleId: created.id,
          tenderType,
          amount: value.negated(),
          currency: sale.currency,
          exchangeRate: sale.exchangeRate,
          baseAmount: toBaseAmount(value.negated(), sale.exchangeRate),
          reference: body.to === "ORIGINAL" ? `Reversal of ${original?.reference?.trim() || sale.saleNo}` : voucherCode,
          voucherId,
        },
      });
    }

    // Stock: the goods come back; damaged ones are written off straight after.
    const writeOffs: AdjustResult[] = [];
    for (const line of lines) {
      const item = await tx.inventoryItem.findUniqueOrThrow({ where: { id: line.source.inventoryItemId }, select: { id: true, unit: true, unitCost: true } });
      await recordStockMovement({
        companyId: actor.companyId,
        userId: actor.userId,
        itemId: item.id,
        movementType: "RECEIPT",
        quantity: line.quantity,
        unit: item.unit,
        unitCost: item.unitCost ?? 0,
        notes: `Retail refund ${created.saleNo}`,
        sourceType: "RETAIL_REFUND",
        reason: "REFUND",
        reference: created.saleNo,
        sourceId: `${created.id}:${item.id}`,
        entryDate: input.at,
        tx,
      });
      if (!body.restock) {
        writeOffs.push(
          await writeOffInTx(tx, {
            actor: auditActor,
            inventoryItemId: item.id,
            quantity: line.quantity,
            reference: created.saleNo,
            note: `Damaged, refunded on ${created.saleNo}`,
            unitCost: line.costUnit.isZero() ? item.unitCost : line.costUnit,
            approvedBy: approvedBy?.name ?? null,
            at: input.at,
          }),
        );
      }
    }

    // Cash leaves exactly one drawer: what it should hold falls by the cash's base amount.
    if (body.to === "CASH" && !value.isZero()) {
      const moved = await tx.retailShift.updateMany({
        where: { id: input.drawer!.id, companyId: actor.companyId, status: "OPEN" },
        data: { expectedCash: { decrement: toBaseAmount(value, sale.exchangeRate) } },
      });
      if (moved.count !== 1) throw new ReversalRefused(409, SHIFT_NO_LONGER_OPEN);
    }

    // CUS-01: the points the sale earned come off, and those it spent go back, in the share refunded.
    await reversePoints(tx, {
      saleId: sale.id,
      reversalSaleId: created.id,
      share: money(sale.totalAmount).isZero() ? 1 : totalAmount.abs().dividedBy(money(sale.totalAmount).abs()),
      actor: { id: actor.userId, name: actorName(actor) },
      at: input.at,
    });

    // STK-09: the deposit handed back with the goods, on the Empties ledger.
    await recordRefundEmpties(tx, {
      companyId: actor.companyId,
      siteId: created.siteId,
      saleId: created.id,
      saleNo: created.saleNo,
      customerId: input.customerId,
      createdById: actor.userId,
      depositAmount: created.depositAmount,
    });

    // R-3.3: who allowed it is the question a reversal is always asked.
    await auditSaleReversed(tx, {
      actor,
      kind: "refund",
      saleId: created.id,
      saleNo: created.saleNo,
      sourceSaleId: sale.id,
      sourceSaleNo: sale.saleNo,
      shiftId: created.shiftId,
      totalAmount: created.totalAmount,
      currency: created.currency,
      reason: input.reason,
      approvedBy,
      extra: { to: body.to, restocked: body.restock, approvedBy: approvedBy?.name ?? null, voucherCode },
    });

    // Last: its fiscal day, settled in this commit (SET-08).
    const fiscal = await assignRetailSaleFiscalDay(tx, { companyId: actor.companyId, saleId: created.id });
    const full = await tx.retailSale.findUniqueOrThrow({ where: { id: created.id }, include: { lines: true, payments: true } });
    return { created: full, value, voucherCode, writeOffs, fiscal };
  });
}
