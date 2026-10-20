import { createHmac, timingSafeEqual } from "node:crypto";

import { esc } from "@/lib/documents/html-renderer";
import { buildWorkspaceUrl } from "@/lib/platform/tenant-url";
import { prisma } from "@/lib/prisma";
import { formatDay, formatMoney } from "@/lib/workspace/format";

import type { RetailAuditActor } from "@/lib/retail/audit";

import { lineValue, lineVat, orderTotals } from "./figures";
import { requisitionStateBadge, REJECT_REASON_WORD, type RequisitionState } from "./requisition-words";
import { requisitionScope } from "./requisitions";
import { paysWord } from "./suppliers";

/**
 * Buying's documents (40-buying 4.10): the purchase order as a PDF, and the
 * signed link a supplier opens it by. The link is the order's id and an
 * expiry, signed with HMAC-SHA256 under `NEXTAUTH_SECRET`; it lasts 30 days
 * (`ORDER_LINK_DAYS`) and needs no sign-in. The PDF itself is rendered by the
 * records PDF route through `renderPdfFromHtml`.
 */

export const ORDER_LINK_DAYS = 30;
const DAY_MS = 86_400_000;

function secret(): string {
  const value = process.env.NEXTAUTH_SECRET?.trim();
  if (!value) throw new Error("NEXTAUTH_SECRET is not set, so document links cannot be signed.");
  return value;
}

function mac(id: string, expiry: number): string {
  return createHmac("sha256", secret()).update(`${id}.${expiry}`).digest("base64url");
}

/** `<expiry seconds>.<signature>` over `<id>.<expiry>`. */
export function signDocumentToken(id: string, expiry: Date): string {
  const seconds = Math.floor(expiry.getTime() / 1000);
  return `${seconds}.${mac(id, seconds)}`;
}

/** "ok" when the token was signed for this id and has not run out; "expired" past its day; else "bad". */
export function checkDocumentToken(id: string, token: string, now: Date = new Date()): "ok" | "expired" | "bad" {
  const match = /^(\d{1,12})\.([A-Za-z0-9_-]+)$/.exec(token);
  if (!match) return "bad";
  const seconds = Number(match[1]);
  const given = Buffer.from(match[2]!);
  const wanted = Buffer.from(mac(id, seconds));
  if (given.length !== wanted.length || !timingSafeEqual(given, wanted)) return "bad";
  return now.getTime() > seconds * 1000 ? "expired" : "ok";
}

export const LINK_RUN_OUT = "This link has run out.";

/**
 * The order PDF's address on the shop's own host, with a 30-day signed token:
 * what a message carries. `requestUrl` is the page the request came from.
 */
export function orderPdfLink(input: { id: string; slug: string; requestUrl: string; now?: Date }): string {
  const now = input.now ?? new Date();
  const token = signDocumentToken(input.id, new Date(now.getTime() + ORDER_LINK_DAYS * DAY_MS));
  return buildWorkspaceUrl({
    slug: input.slug,
    path: `/api/v2/retail/records/RetailPurchaseOrder/${input.id}/pdf?token=${encodeURIComponent(token)}`,
    currentUrl: input.requestUrl,
  }).toString();
}

const PAYMENT_WORDS = { ON_ACCOUNT: "On account", CASH_ON_DELIVERY: "Cash on delivery" } as const;

function rows(pairs: Array<[string, string]>): string {
  return pairs.map(([label, value]) => `<tr><td>${esc(label)}</td><td class="num mono">${esc(value)}</td></tr>`).join("");
}

/**
 * The purchase order a supplier receives: the shop's legal and trading names
 * and VAT number, the PO number, supplier, deliver to, expected, the lines
 * with cost and VAT, the total, how it is paid and the note. Null when the
 * order is not this company's.
 */
export async function renderOrderPdf(companyId: string, id: string) {
  const order = await prisma.retailPurchaseOrder.findFirst({
    where: { id, companyId },
    include: {
      vendor: { select: { name: true, code: true, payTermsDays: true, address: true } },
      site: { select: { name: true } },
      lines: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
    },
  });
  if (!order) return null;
  const settings = await prisma.accountingSettings.findUnique({
    where: { companyId },
    select: { legalName: true, tradingName: true, vatNumber: true },
  });
  const totals = orderTotals(order.lines.map((line) => ({ quantity: line.quantity, unitCost: line.unitCost, vatRate: line.vatRate })));
  const shop = [settings?.tradingName, settings?.legalName && settings.legalName !== settings.tradingName ? settings.legalName : null]
    .filter(Boolean)
    .join(" · ");
  const head = rows([
    ["From", shop || "—"],
    ["VAT number", settings?.vatNumber ?? "—"],
    ["To", order.vendor.name],
    ["Deliver to", order.site?.name ?? "As agreed"],
    ["Expected", order.expectedDate ? formatDay(order.expectedDate) : "When you can"],
    [
      "Paying",
      order.payment === "CASH_ON_DELIVERY"
        ? PAYMENT_WORDS.CASH_ON_DELIVERY
        : `${PAYMENT_WORDS.ON_ACCOUNT}, ${paysWord(order.vendor.payTermsDays).toLowerCase()}`,
    ],
  ]);
  const lines = order.lines
    .map((line) => {
      const value = lineValue(line.quantity, line.unitCost);
      return `<tr><td>${esc(line.itemName)}</td><td class="num mono">${esc(Number(line.quantity).toString())}</td><td class="num mono">${esc(
        formatMoney(Number(line.unitCost)),
      )}</td><td class="num mono">${esc(`${Number(line.vatRate)}%`)}</td><td class="num mono">${esc(formatMoney(Number(value)))}</td><td class="num mono">${esc(
        formatMoney(Number(lineVat(value, line.vatRate))),
      )}</td></tr>`;
    })
    .join("");
  const money = rows([
    ["Lines", formatMoney(Number(totals.lines))],
    ["VAT", formatMoney(Number(totals.vat))],
    ["Total", formatMoney(Number(totals.total))],
  ]);
  return {
    ref: order.poNo,
    title: `Purchase order ${order.poNo}`,
    subtitle: `${order.vendor.name} · ${formatDay(order.createdAt)}`,
    content: `<div class="rd-cols">
  <table class="rd-table"><caption>Order</caption><tbody>${head}</tbody></table>
  <table class="rd-table"><caption>Money</caption><tbody>${money}</tbody></table>
</div>
<table class="rd-table"><caption>Lines</caption>
  <thead><tr><th>Product</th><th class="num">Quantity</th><th class="num">Cost</th><th class="num">VAT rate</th><th class="num">Value</th><th class="num">VAT</th></tr></thead>
  <tbody>${lines}</tbody>
</table>
${order.noteToSupplier ? `<p class="rd-note">${esc(order.noteToSupplier)}</p>` : ""}`,
  };
}

/**
 * A delivery note (40-buying 4.10): the shop's names and VAT number, the GRN
 * number, supplier, order, note number, driver, who counted and checked it,
 * and each line on the note, counted, broken and in stock at its cost. The
 * record's "Print", "Export as PDF" and the Lines tab's "Delivery note PDF".
 * Null when the delivery is not this company's.
 */
export async function renderDeliveryNotePdf(companyId: string, id: string) {
  const receipt = await prisma.retailGoodsReceipt.findFirst({
    where: { id, companyId },
    include: {
      vendor: { select: { name: true } },
      site: { select: { name: true } },
      purchaseOrder: { select: { poNo: true } },
      countedBy: { select: { name: true } },
      checkedBy: { select: { name: true } },
      lines: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!receipt) return null;
  const settings = await prisma.accountingSettings.findUnique({
    where: { companyId },
    select: { legalName: true, tradingName: true, vatNumber: true },
  });
  const shop = [settings?.tradingName, settings?.legalName && settings.legalName !== settings.tradingName ? settings.legalName : null]
    .filter(Boolean)
    .join(" · ");
  const head = rows([
    ["Shop", shop || "—"],
    ["VAT number", settings?.vatNumber ?? "—"],
    ["Supplier", receipt.vendor.name],
    ["Order", receipt.purchaseOrder?.poNo ?? "No order"],
    ["Note number", receipt.noteNumber ?? "—"],
    ["Driver", receipt.driver ?? "—"],
  ]);
  const received = rows([
    ["Received", formatDay(receipt.createdAt)],
    ["Site", receipt.site.name],
    ["Counted by", receipt.countedBy?.name ?? "—"],
    ["Checked by", receipt.checkedBy?.name ?? "Not yet"],
  ]);
  const lines = receipt.lines
    .map(
      (line) =>
        `<tr><td>${esc(line.itemName)}</td><td class="num mono">${esc(Number(line.noteQuantity).toString())}</td><td class="num mono">${esc(
          Number(line.damagedQuantity).toString(),
        )}</td><td class="num mono">${esc(Number(line.quantity).toString())}</td><td class="num mono">${esc(formatMoney(Number(line.unitCost)))}</td><td class="num mono">${esc(
          formatMoney(Number(line.lineTotal)),
        )}</td></tr>`,
    )
    .join("");
  const total = receipt.lines.reduce((sum, line) => sum + Number(line.lineTotal), 0);
  return {
    ref: receipt.receiptNo,
    title: `Delivery ${receipt.receiptNo}`,
    subtitle: `${receipt.vendor.name} · ${formatDay(receipt.createdAt)}`,
    content: `<div class="rd-cols">
  <table class="rd-table"><caption>Delivery</caption><tbody>${head}</tbody></table>
  <table class="rd-table"><caption>Received</caption><tbody>${received}</tbody></table>
</div>
<table class="rd-table"><caption>Lines</caption>
  <thead><tr><th>Product</th><th class="num">On the note</th><th class="num">Damaged</th><th class="num">In stock</th><th class="num">Cost</th><th class="num">Value</th></tr></thead>
  <tbody>${lines}<tr><td>Total</td><td></td><td></td><td></td><td></td><td class="num mono">${esc(formatMoney(total))}</td></tr></tbody>
</table>
${receipt.notes ? `<p class="rd-note">${esc(receipt.notes)}</p>` : ""}`,
  };
}

const SIGN_BOXES = ["Asked by", "Approved by", "Paid out by", "Received by"];

/**
 * A requisition on paper (40-buying 4.10): its number, state, who asked and
 * when, what it is for (the order or the expense), the amount and the money
 * account, and the decision. With `sign`, four boxes to sign: "Asked by",
 * "Approved by", "Paid out by", "Received by". Null when this person may not
 * read it (another's, for a view-own role).
 */
export async function renderRequisitionPdf(actor: RetailAuditActor, id: string, sign: boolean) {
  const requisition = await prisma.crmRequisition.findFirst({
    where: { id, ...requisitionScope(actor) },
    include: {
      requestedBy: { select: { name: true } },
      approvedBy: { select: { name: true } },
      disbursedBy: { select: { name: true } },
      bankAccount: { select: { name: true } },
      payee: { select: { name: true } },
      expenseType: { select: { name: true } },
      purchaseOrder: { select: { poNo: true } },
      site: { select: { name: true } },
    },
  });
  if (!requisition) return null;
  const state = requisition.status as RequisitionState;
  const amount = Number(requisition.approvedAmount ?? requisition.amount);
  const head = rows([
    ["State", requisitionStateBadge(state).label],
    ["Asked by", requisition.requestedBy.name],
    ["Asked", formatDay(requisition.submittedAt ?? requisition.createdAt)],
    ["For", requisition.purchaseOrder ? `Order ${requisition.purchaseOrder.poNo}` : (requisition.expenseType?.name ?? "—")],
    ["Shop", requisition.site?.name ?? "—"],
    ["Needed by", requisition.neededBy ? formatDay(requisition.neededBy) : "—"],
  ]);
  const money = rows([
    ["Asked for", formatMoney(Number(requisition.amount), requisition.currency)],
    ...(requisition.approvedAmount ? ([["Approved", formatMoney(amount, requisition.currency)]] as Array<[string, string]>) : []),
    ["Pay from", requisition.bankAccount?.name ?? "—"],
    ["Pay to", requisition.payee?.name ?? "—"],
    ["Decided by", requisition.approvedBy?.name ?? "—"],
    ...(requisition.rejectReason ? ([["Why not", REJECT_REASON_WORD[requisition.rejectReason]]] as Array<[string, string]>) : []),
  ]);
  const boxes = sign
    ? `<table class="rd-table"><caption>Signatures</caption><tbody>${SIGN_BOXES.map(
        (label) => `<tr><td style="width:30%">${esc(label)}</td><td style="height:40px"></td><td style="width:25%">Date</td></tr>`,
      ).join("")}</tbody></table>`
    : "";
  return {
    ref: requisition.requisitionNo ?? "Requisition",
    title: `Requisition ${requisition.requisitionNo ?? ""}`.trim(),
    subtitle: `${requisition.purpose} · ${formatMoney(amount, requisition.currency)}`,
    content: `<div class="rd-cols">
  <table class="rd-table"><caption>Request</caption><tbody>${head}</tbody></table>
  <table class="rd-table"><caption>Money</caption><tbody>${money}</tbody></table>
</div>
${requisition.notes ? `<p class="rd-note">${esc(requisition.notes)}</p>` : ""}
${requisition.decisionNote ? `<p class="rd-note">${esc(requisition.decisionNote)}</p>` : ""}
${boxes}`,
  };
}
