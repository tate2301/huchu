import type { Prisma, RetailReceiptSendBy } from "@prisma/client";

import { normalizePhoneE164 } from "@/lib/crm/phone";
import { prisma } from "@/lib/prisma";
import type { RetailAuditActor } from "@/lib/retail/audit";
import { TENDER_OPTIONS, tenderKeyOf } from "@/lib/retail/payment-words";
import { loadShopProfile } from "@/lib/retail/shop-profile";
import {
  receiptAmount,
  receiptDoc,
  receiptLineLabel,
  receiptText,
  receiptTextLines,
  type ReceiptContent,
  type ReceiptDoc,
  type ReceiptWire,
} from "@/lib/retail/receipt-words";

/**
 * Receipts (SET-07, W-07): the shop's `RetailReceiptSettings` row, the receipt
 * every till prints from it, and the copy a sale sends the customer when the
 * shop also sends by WhatsApp or email. The words and the layout are
 * `receipt-words.ts`; this reads them from the database.
 */

type Db = Prisma.TransactionClient | typeof prisma;

export type ReceiptSettingsRow = {
  header: string | null;
  footer: string | null;
  showVatNumber: boolean;
  showLicenceNumber: boolean;
  printLogo: boolean;
  copies: 1 | 2;
  alsoSendBy: RetailReceiptSendBy;
};

export const DEFAULT_RECEIPT_SETTINGS: ReceiptSettingsRow = {
  header: null,
  footer: null,
  showVatNumber: true,
  showLicenceNumber: true,
  printLogo: false,
  copies: 1,
  alsoSendBy: "NOTHING",
};

/** The shop's receipt settings; no row reads as the defaults. */
export async function loadReceiptSettings(companyId: string, db: Db = prisma): Promise<ReceiptSettingsRow> {
  const row = await db.retailReceiptSettings.findUnique({ where: { companyId } });
  if (!row) return DEFAULT_RECEIPT_SETTINGS;
  return {
    header: row.header,
    footer: row.footer,
    showVatNumber: row.showVatNumber,
    showLicenceNumber: row.showLicenceNumber,
    printLogo: row.printLogo,
    copies: row.copies === 2 ? 2 : 1,
    alsoSendBy: row.alsoSendBy,
  };
}

export type ReceiptSettingsPatch = Partial<ReceiptSettingsRow>;

/** Write the changed settings, stamping who changed them (the save's transaction). */
export async function saveReceiptSettings(
  tx: Prisma.TransactionClient,
  actor: RetailAuditActor,
  patch: ReceiptSettingsPatch,
): Promise<void> {
  const data = { ...patch, updatedById: actor.userId };
  await tx.retailReceiptSettings.upsert({
    where: { companyId: actor.companyId },
    update: data,
    create: { companyId: actor.companyId, ...DEFAULT_RECEIPT_SETTINGS, ...data },
  });
}

/** The site a receipt's default top names: the one asked for, else the shop's default, else its first open one. */
async function receiptSite(companyId: string, siteId: string | null, defaultSiteId: string | null, db: Db) {
  const select = { name: true, location: true } as const;
  for (const id of [siteId, defaultSiteId]) {
    if (!id) continue;
    const site = await db.site.findFirst({ where: { id, companyId }, select });
    if (site) return site;
  }
  return db.site.findFirst({ where: { companyId, isActive: true }, orderBy: { createdAt: "asc" }, select });
}

/**
 * The top of the receipt when the shop has not written one: its trading name
 * in capitals and the site's address, a line each, cut to fit the paper.
 */
export function defaultReceiptHeader(tradingName: string, address: string | null): string {
  return [tradingName.toUpperCase(), address ?? ""]
    .map((line) => line.trim().slice(0, 42))
    .filter(Boolean)
    .join("\n");
}

/**
 * The settings as a till prints them (10-setup 4.7 `ReceiptWire`), for a
 * receipt at `siteId` (else the shop's default site): the header resolved,
 * the VAT number only while registered, the licence number only on a liquor
 * store.
 */
export async function receiptWire(companyId: string, siteId: string | null = null, db: Db = prisma): Promise<ReceiptWire> {
  const [settings, profile, branding, company] = await Promise.all([
    loadReceiptSettings(companyId, db),
    loadShopProfile(companyId),
    db.companyBranding.findUnique({
      where: { companyId },
      select: { tradingName: true, displayName: true, vatNumber: true, logoUrl: true },
    }),
    db.company.findUnique({ where: { id: companyId }, select: { name: true } }),
  ]);
  let header = receiptTextLines(settings.header).join("\n");
  if (!header) {
    const site = await receiptSite(companyId, siteId, profile.defaultSiteId, db);
    const name = branding?.tradingName || branding?.displayName || company?.name || "";
    header = defaultReceiptHeader(name, site?.location ?? null);
  }
  const liquor = profile.businessType === "LIQUOR";
  return {
    header,
    footer: receiptTextLines(settings.footer).join("\n"),
    showVatNumber: settings.showVatNumber,
    showLicenceNumber: settings.showLicenceNumber,
    printLogo: settings.printLogo,
    copies: settings.copies,
    alsoSendBy: settings.alsoSendBy,
    vatNumber: profile.vatRegistered ? branding?.vatNumber?.trim() || null : null,
    licenceNumber: liquor ? profile.licenceNumber?.trim() || null : null,
    logoUrl: branding?.logoUrl ?? null,
    liquor,
  };
}

/* ── A sale as a receipt ───────────────────────────────────────────────────── */

const saleSelect = {
  id: true,
  siteId: true,
  currency: true,
  totalAmount: true,
  depositAmount: true,
  changeAmount: true,
  lines: {
    // The order rung: a sale's lines are written together, so they share a time and keep the order written.
    orderBy: { createdAt: "asc" },
    select: { itemName: true, quantity: true, lineTotal: true, depositAmount: true },
  },
  payments: {
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { tenderType: true, currency: true, amount: true },
  },
  fiscalReceipt: { select: { fiscalDay: { select: { deviceId: true, fiscalDayNo: true } } } },
} satisfies Prisma.RetailSaleSelect;

type ReceiptSale = Prisma.RetailSaleGetPayload<{ select: typeof saleSelect }>;

/** "US$" or "ZiG": the money a receipt's total is in. */
export function receiptCurrency(currency: string | null | undefined): "US$" | "ZiG" {
  return (currency ?? "").toUpperCase() === "ZWG" ? "ZiG" : "US$";
}

/** "FDMS 0441-2209 · Day 214". */
export function fiscalLine(day: { deviceId: string; fiscalDayNo: number } | null | undefined): string | null {
  return day ? `FDMS ${day.deviceId} · Day ${day.fiscalDayNo}` : null;
}

/** A sale's lines as the receipt prints them: each line, then its deposit as "Deposit x{n}". */
export function saleReceiptContent(sale: ReceiptSale): ReceiptContent {
  const lines: ReceiptContent["lines"] = [];
  for (const line of sale.lines) {
    const quantity = Number(line.quantity);
    lines.push({ label: receiptLineLabel(line.itemName, quantity), amount: receiptAmount(line.lineTotal.toString()) });
    if (Number(line.depositAmount) !== 0) {
      lines.push({ label: `Deposit x${Number(quantity.toFixed(3))}`, amount: receiptAmount(line.depositAmount.toString()) });
    }
  }
  return {
    lines,
    total: receiptAmount(Number(sale.totalAmount) + Number(sale.depositAmount)),
    currency: receiptCurrency(sale.currency),
    tenders: [
      ...sale.payments.map((payment) => ({
        label:
          TENDER_OPTIONS.find((option) => option.key === tenderKeyOf(payment.tenderType, payment.currency))?.tillLabel ??
          payment.tenderType,
        amount: receiptAmount(payment.amount.toString()),
      })),
      // What was handed back, when the customer paid over.
      ...(Number(sale.changeAmount ?? 0) > 0 ? [{ label: "Change", amount: receiptAmount(sale.changeAmount!.toString()) }] : []),
    ],
    fiscal: fiscalLine(sale.fiscalReceipt?.fiscalDay),
  };
}

/** The lines a sale's receipt prints, its deposit lines counted. */
function receiptLineCount(sale: Pick<ReceiptSale, "lines">): number {
  return sale.lines.reduce((count, line) => count + (Number(line.depositAmount) !== 0 ? 2 : 1), 0);
}

/** One sale's receipt as its till prints it now: the settings in force, its site's top lines. */
export async function saleReceipt(
  companyId: string,
  saleId: string,
  db: Db = prisma,
): Promise<{ doc: ReceiptDoc; copies: 1 | 2 } | null> {
  const sale = await db.retailSale.findFirst({ where: { id: saleId, companyId }, select: saleSelect });
  if (!sale) return null;
  const wire = await receiptWire(companyId, sale.siteId, db);
  return { doc: receiptDoc(wire, saleReceiptContent(sale)), copies: wire.copies };
}

/** Sales looked at for the preview, newest first, before giving up on one that fits. */
const PREVIEW_LOOKBACK = 50;
const PREVIEW_MAX_LINES = 4;

/**
 * What the Receipts page previews (10-setup 4.7): the shop's latest posted
 * sale that prints four lines or fewer, deposits counted; with no such sale,
 * its first two products, one of each, paid in cash.
 */
export async function receiptPreview(companyId: string): Promise<ReceiptContent> {
  const sales = await prisma.retailSale.findMany({
    where: { companyId, saleType: "SALE", status: "POSTED" },
    orderBy: [{ postedAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
    take: PREVIEW_LOOKBACK,
    select: saleSelect,
  });
  const sale = sales.find((candidate) => candidate.lines.length > 0 && receiptLineCount(candidate) <= PREVIEW_MAX_LINES);
  if (sale) return saleReceiptContent(sale);

  const [products, accounting] = await Promise.all([
    prisma.product.findMany({
      where: { companyId, archivedAt: null, isActive: true },
      orderBy: [{ createdAt: "asc" }, { name: "asc" }],
      take: 2,
      select: { name: true, standardPrice: true },
    }),
    prisma.accountingSettings.findUnique({ where: { companyId }, select: { baseCurrency: true } }),
  ]);
  const total = products.reduce((sum, product) => sum + Number(product.standardPrice), 0);
  const currency = receiptCurrency(accounting?.baseCurrency);
  return {
    lines: products.map((product) => ({ label: product.name, amount: receiptAmount(product.standardPrice.toString()) })),
    total: receiptAmount(total),
    currency,
    tenders: products.length > 0 ? [{ label: currency === "ZiG" ? "Cash ZiG" : "Cash US$", amount: receiptAmount(total) }] : [],
    fiscal: null,
  };
}

/* ── The customer's copy ───────────────────────────────────────────────────── */

export type ReceiptRecipient = { phone: string | null; email: string | null };

/**
 * Queue the customer's copy of a sale's receipt in the outbox, inside the
 * sale's own transaction (W-07: "Also send by"): on WhatsApp to the
 * customer's phone, by email to their address. Nothing when the shop sends
 * nothing, or when the customer left no phone (no address) for the way it
 * sends. The drain sends it, refreshed then with the fiscal line signed
 * after the sale committed (`refreshReceiptBody`).
 */
export async function queueSaleReceipt(
  tx: Prisma.TransactionClient,
  input: { companyId: string; saleId: string; to: ReceiptRecipient | null; createdById: string | null },
): Promise<{ id: string } | null> {
  const settings = await loadReceiptSettings(input.companyId, tx);
  if (settings.alsoSendBy === "NOTHING" || !input.to) return null;
  const channel = settings.alsoSendBy;
  // A phone as Meta takes it, Zimbabwe when no country is typed ("0772 123 456" → "+263772123456").
  const to = channel === "WHATSAPP" ? normalizePhoneE164(input.to.phone, "263") : input.to.email?.trim();
  if (!to) return null;
  const receipt = await saleReceipt(input.companyId, input.saleId, tx);
  if (!receipt) return null;
  return tx.retailMessage.create({
    data: {
      companyId: input.companyId,
      channel,
      to,
      template: "receipt",
      body: receiptText(receipt.doc),
      saleId: input.saleId,
      createdById: input.createdById,
    },
    select: { id: true },
  });
}

/** A receipt message's text as of now: the sale's receipt again, its fiscal line included once signed. */
export async function refreshReceiptBody(message: { companyId: string; saleId: string | null }): Promise<string | null> {
  if (!message.saleId) return null;
  const receipt = await saleReceipt(message.companyId, message.saleId);
  return receipt ? receiptText(receipt.doc) : null;
}
