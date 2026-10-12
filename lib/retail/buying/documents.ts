import { createHmac, timingSafeEqual } from "node:crypto";

import { esc } from "@/lib/documents/html-renderer";
import { buildWorkspaceUrl } from "@/lib/platform/tenant-url";
import { prisma } from "@/lib/prisma";
import { formatDay, formatMoney } from "@/lib/workspace/format";

import { lineValue, lineVat, orderTotals } from "./figures";
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
    ["Deliver to", order.site.name],
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
