import { prisma } from "@/lib/prisma";
import { num, result } from "@/lib/reports/loaders/shared";
import type { ReportContext, ReportLoader, ReportParams, ReportRow } from "@/lib/reports/types";
import { tenderWord } from "@/lib/retail/words";

/**
 * A sale's record tabs, read for one sale (the `sale` parent). A sale has a
 * handful of lines, so each loads in memory. Every row carries the sale's
 * cashier, which a cashier's own scope reads. A VOID document has no record.
 */

const cents = (value: number) => Math.round(value * 100) / 100;

async function saleFor(ctx: ReportContext, params: ReportParams) {
  if (!params.sale) return null;
  return prisma.retailSale.findFirst({
    where: { id: params.sale, companyId: ctx.companyId, saleType: { in: ["SALE", "REFUND"] } },
    select: {
      id: true,
      saleType: true,
      cashierId: true,
      changeAmount: true,
      depositAmount: true,
      lines: {
        orderBy: { createdAt: "asc" },
        select: { id: true, itemName: true, productId: true, quantity: true, unitPrice: true, discountAmount: true, lineTotal: true, depositAmount: true },
      },
      payments: { orderBy: { createdAt: "asc" }, select: { id: true, tenderType: true, currency: true, reference: true, amount: true } },
      fiscalReceipt: { select: { id: true, status: true, receiptNumber: true, fiscalNumber: true, issuedAt: true, fiscalDay: { select: { fiscalDayNo: true } } } },
      reversals: {
        where: { saleType: "REFUND", status: "POSTED" },
        orderBy: { postedAt: "desc" },
        select: {
          id: true,
          saleNo: true,
          postedAt: true,
          createdAt: true,
          totalAmount: true,
          fiscalReceipt: { select: { id: true, status: true, receiptNumber: true, fiscalNumber: true, issuedAt: true, fiscalDay: { select: { fiscalDayNo: true } } } },
        },
      },
    },
  });
}

async function loadLines(ctx: ReportContext, params: ReportParams) {
  const sale = await saleFor(ctx, params);
  if (!sale) return result([]);
  const rows: ReportRow[] = sale.lines.map((line, index) => {
    const quantity = num(line.quantity) ?? 0;
    return {
      id: line.id,
      saleId: sale.id,
      cashierId: sale.cashierId,
      order: index,
      name: line.itemName,
      productId: line.productId,
      quantity,
      quantityText: `${quantity} × ${(num(line.unitPrice) ?? 0).toFixed(2)}`,
      price: num(line.unitPrice),
      discount: num(line.discountAmount),
      total: num(line.lineTotal),
    };
  });
  // The bottles' deposit is paid with the goods but is not them: its own row, after.
  const deposit = num(sale.depositAmount) ?? 0;
  if (deposit !== 0) {
    const bottles = sale.lines
      .filter((line) => (num(line.depositAmount) ?? 0) !== 0)
      .reduce((sum, line) => sum + Math.abs(num(line.quantity) ?? 0), 0);
    rows.push({
      id: `${sale.id}:deposit`,
      saleId: sale.id,
      cashierId: sale.cashierId,
      order: rows.length,
      name: `Deposit on ${bottles} ${bottles === 1 ? "bottle" : "bottles"}`,
      productId: null,
      quantity: null,
      quantityText: "",
      price: null,
      discount: null,
      total: cents(deposit),
    });
  }
  return result(rows);
}

async function loadPayments(ctx: ReportContext, params: ReportParams) {
  const sale = await saleFor(ctx, params);
  if (!sale) return result([]);
  const rows: ReportRow[] = sale.payments.map((payment, index) => ({
    id: payment.id,
    saleId: sale.id,
    cashierId: sale.cashierId,
    order: index,
    paidWith: tenderWord(payment),
    reference: payment.reference,
    currency: payment.currency === "ZWG" ? "ZiG" : "US$",
    amount: num(payment.amount),
  }));
  // Change handed back is money out of what was tendered: a negative row, so the Σ is what the sale kept.
  const change = num(sale.changeAmount) ?? 0;
  if (change > 0) {
    rows.push({
      id: `${sale.id}:change`,
      saleId: sale.id,
      cashierId: sale.cashierId,
      order: rows.length,
      paidWith: "Change",
      reference: null,
      currency: "US$",
      amount: -cents(change),
    });
  }
  return result(rows);
}

type Receipt = NonNullable<NonNullable<Awaited<ReturnType<typeof saleFor>>>["fiscalReceipt"]>;

function receiptState(status: string): string {
  if (status === "SUCCESS") return "Signed";
  if (status === "FAILED") return "Not signed";
  return "Waiting for ZIMRA";
}

async function loadReceipt(ctx: ReportContext, params: ReportParams) {
  const sale = await saleFor(ctx, params);
  if (!sale) return result([]);
  const row = (receipt: Receipt, what: string, saleId: string, order: number): ReportRow => ({
    id: receipt.id,
    saleId,
    cashierId: sale.cashierId,
    order,
    what,
    receipt: receipt.receiptNumber ?? receipt.fiscalNumber ?? "—",
    dayNo: receipt.fiscalDay?.fiscalDayNo ?? null,
    signedAt: receipt.issuedAt?.toISOString() ?? null,
    state: receiptState(receipt.status),
  });
  const rows: ReportRow[] = [];
  if (sale.fiscalReceipt) rows.push(row(sale.fiscalReceipt, sale.saleType === "REFUND" ? "Credit note" : "Fiscal receipt", sale.id, 0));
  // A sale's refunds each carry their credit note.
  sale.reversals.forEach((refund, index) => {
    if (refund.fiscalReceipt) rows.push(row(refund.fiscalReceipt, `Credit note, ${refund.saleNo}`, refund.id, index + 1));
  });
  return result(rows);
}

async function loadRefunds(ctx: ReportContext, params: ReportParams) {
  const sale = await saleFor(ctx, params);
  if (!sale) return result([]);
  return result(
    sale.reversals.map((refund) => ({
      id: refund.id,
      saleId: sale.id,
      cashierId: sale.cashierId,
      saleNo: refund.saleNo,
      postedAt: (refund.postedAt ?? refund.createdAt).toISOString(),
      total: num(refund.totalAmount),
    })),
  );
}

export const SALE_RECORD_LOADERS: Record<string, ReportLoader> = {
  "retail-sale-lines": { load: loadLines },
  "retail-sale-payments": { load: loadPayments },
  "retail-sale-receipt": { load: loadReceipt },
  "retail-sale-refunds": { load: loadRefunds },
};
