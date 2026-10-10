import { Prisma } from "@prisma/client";

import { receiptCopyPdfHtml } from "@/components/retail/receipt-print";
import { normalizePhoneE164 } from "@/lib/crm/phone";
import { renderPdfFromHtml } from "@/lib/documents/pdf-renderer";
import { defaultTemplateSchema } from "@/lib/documents/template-schema";
import { isWhatsAppConfigured } from "@/lib/messaging/whatsapp";
import { prisma } from "@/lib/prisma";
import { auditRecordEdited, RETAIL_AUDIT_EVENTS, writeRetailAuditEvent, type RetailAuditActor } from "@/lib/retail/audit";
import { loadSaleView, type SaleView } from "@/lib/retail/floor/sale-view";
import { readsEveryCashier } from "@/lib/retail/own-rows";
import { queueSaleReceipt, saleReceipt } from "@/lib/retail/receipt-settings";

/**
 * What the back office does to a sale (50-floor, FLR-01): link a customer,
 * fix a payment's reference, print a copy of the receipt, send it on
 * WhatsApp, and mark a flagged sale as looked at. No money, stock or journal
 * moves here. Refunds and voids are FLR-02's.
 */

export class SaleRefusal extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 | 409,
    readonly fieldErrors?: Record<string, string>,
  ) {
    super(message);
    this.name = "SaleRefusal";
  }
}

export const SALE_NOT_FOUND = "Sale not found";
export const NOT_THIS_SHOPS_CUSTOMER = "That customer is not this shop’s.";
export const GIVE_A_NUMBER = "Give a WhatsApp number, like +263 77 412 3388.";

export type SaleActor = RetailAuditActor & { userId: string; userRole: string | null };

/** "••• 3388": a number as a screen or a log shows it. */
export function maskedNumber(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return `••• ${digits.slice(-4)}`;
}

/** A sale the caller may read: a cashier only their own; a VOID document never. */
async function readableSale(companyId: string, id: string, actor: Pick<SaleActor, "userId" | "userRole">) {
  const sale = await prisma.retailSale.findFirst({
    where: { id, companyId, saleType: { in: ["SALE", "REFUND"] } },
    select: {
      id: true,
      saleNo: true,
      status: true,
      cashierId: true,
      customerId: true,
      customerName: true,
      reviewReason: true,
      reviewedAt: true,
      customer: { select: { name: true, phone: true } },
    },
  });
  if (!sale) return null;
  if (!readsEveryCashier(actor.userRole) && sale.cashierId !== actor.userId) return null;
  return sale;
}

export type SaleChange = { field: string; from: string | null; to: string | null };

export async function updateSale(
  companyId: string,
  id: string,
  actor: SaleActor,
  body: { customerId?: string | null; paymentReference?: { paymentId: string; reference: string } },
): Promise<{ data: SaleView; changed: SaleChange[] }> {
  const sale = await readableSale(companyId, id, actor);
  if (!sale) throw new SaleRefusal(SALE_NOT_FOUND, 404);
  if (sale.status === "VOIDED") throw new SaleRefusal(`${sale.saleNo} was voided.`, 409);

  const changed: SaleChange[] = [];
  await prisma.$transaction(async (tx) => {
    if (body.customerId !== undefined) {
      const customer = body.customerId
        ? await tx.customer.findFirst({ where: { id: body.customerId, companyId, isActive: true }, select: { id: true, name: true } })
        : null;
      if (body.customerId && !customer) throw new SaleRefusal("Validation failed", 400, { customer: NOT_THIS_SHOPS_CUSTOMER });
      const from = sale.customer?.name ?? sale.customerName ?? "Walk-in";
      const to = customer?.name ?? "Walk-in";
      if (sale.customerId !== (customer?.id ?? null)) {
        await tx.retailSale.update({
          where: { id: sale.id },
          data: { customerId: customer?.id ?? null, customerName: customer?.name ?? null },
        });
        await auditRecordEdited(tx, { actor, entityType: "RetailSale", entityId: sale.id, field: "customer", label: "Customer", from, to });
        changed.push({ field: "customer", from, to });
      }
    }
    if (body.paymentReference) {
      const payment = await tx.retailSalePayment.findFirst({
        where: { id: body.paymentReference.paymentId, saleId: sale.id, companyId },
        select: { id: true, reference: true },
      });
      if (!payment) throw new SaleRefusal("Payment not found", 404);
      const to = body.paymentReference.reference.trim();
      if (payment.reference !== to) {
        await tx.retailSalePayment.update({ where: { id: payment.id }, data: { reference: to } });
        await auditRecordEdited(tx, {
          actor,
          entityType: "RetailSale",
          entityId: sale.id,
          field: "reference",
          label: "Reference",
          from: payment.reference,
          to,
        });
        changed.push({ field: "reference", from: payment.reference, to });
      }
    }
  });

  const data = await loadSaleView(companyId, sale.id, { userId: actor.userId, role: actor.userRole });
  if (!data) throw new SaleRefusal(SALE_NOT_FOUND, 404);
  return { data, changed };
}

/** The receipt printed again, "COPY" above its header, as an 80 mm PDF. */
export async function reprintSaleReceipt(companyId: string, id: string, actor: SaleActor): Promise<{ saleNo: string; pdf: Buffer }> {
  const sale = await readableSale(companyId, id, actor);
  if (!sale) throw new SaleRefusal(SALE_NOT_FOUND, 404);
  const receipt = await saleReceipt(companyId, sale.id);
  if (!receipt) throw new SaleRefusal(SALE_NOT_FOUND, 404);
  const pdf = await renderPdfFromHtml({
    html: receiptCopyPdfHtml(receipt.doc),
    template: { ...defaultTemplateSchema, page: { ...defaultTemplateSchema.page, marginMm: 0, orientation: "portrait" } },
  });
  await prisma.$transaction((tx) =>
    writeRetailAuditEvent(tx, {
      actor,
      eventType: RETAIL_AUDIT_EVENTS.saleReprinted,
      entityType: "RetailSale",
      entityId: sale.id,
      payload: { saleNo: sale.saleNo, copy: true },
    }),
  );
  return { saleNo: sale.saleNo, pdf };
}

/** Queue one sale's receipt on WhatsApp, with its audit line; false, and no line, when nothing was queued. */
async function queueOne(
  tx: Prisma.TransactionClient,
  companyId: string,
  saleId: string,
  saleNo: string,
  phone: string,
  actor: SaleActor,
): Promise<boolean> {
  const message = await queueSaleReceipt(tx, { companyId, saleId, to: { phone, email: null }, createdById: actor.userId, channel: "WHATSAPP" });
  if (!message) return false;
  await writeRetailAuditEvent(tx, {
    actor,
    eventType: RETAIL_AUDIT_EVENTS.saleSent,
    entityType: "RetailSale",
    entityId: saleId,
    payload: { saleNo, to: maskedNumber(phone) },
  });
  return true;
}

/**
 * Send the receipt on WhatsApp: to the number given, else the linked
 * customer's. With WhatsApp not connected the message waits in the outbox
 * (98-decisions C-04) and `waiting` says so.
 */
export async function sendSaleReceipt(
  companyId: string,
  id: string,
  actor: SaleActor,
  given: string | undefined,
): Promise<{ queued: true; to: string; waiting: boolean }> {
  const sale = await readableSale(companyId, id, actor);
  if (!sale) throw new SaleRefusal(SALE_NOT_FOUND, 404);
  const raw = given?.trim() ? given : sale.customer?.phone;
  const phone = normalizePhoneE164(raw, "263");
  if (!phone || phone.replace(/\D/g, "").length < 9) throw new SaleRefusal("Validation failed", 400, { to: GIVE_A_NUMBER });
  const queued = await prisma.$transaction((tx) => queueOne(tx, companyId, sale.id, sale.saleNo, phone, actor));
  // Nothing to send means no receipt could be made of the sale.
  if (!queued) throw new SaleRefusal(SALE_NOT_FOUND, 404);
  return { queued: true, to: maskedNumber(phone), waiting: !isWhatsAppConfigured() };
}

/**
 * "Send receipts": one receipt for each ticked sale with a customer's
 * number. `noNumber` counts the ticked sales this person may read that have
 * none; ids they may not read (a cashier's colleague's sale) are left out.
 */
export async function sendSaleReceipts(
  companyId: string,
  ids: string[],
  actor: SaleActor,
): Promise<{ sent: number; noNumber: number }> {
  const sales = await prisma.retailSale.findMany({
    where: {
      id: { in: ids },
      companyId,
      saleType: { in: ["SALE", "REFUND"] },
      ...(readsEveryCashier(actor.userRole) ? {} : { cashierId: actor.userId }),
    },
    select: { id: true, saleNo: true, customer: { select: { phone: true } } },
  });
  const reachable = sales
    .map((sale) => ({ sale, phone: normalizePhoneE164(sale.customer?.phone, "263") }))
    .filter((entry): entry is { sale: (typeof sales)[number]; phone: string } => Boolean(entry.phone));
  let sent = 0;
  if (reachable.length) {
    await prisma.$transaction(async (tx) => {
      for (const { sale, phone } of reachable) if (await queueOne(tx, companyId, sale.id, sale.saleNo, phone, actor)) sent += 1;
    });
  }
  return { sent, noNumber: sales.length - sent };
}

/** "Mark as looked at" (W-44): a flagged sale nobody has looked at yet. */
export async function markSaleReviewed(companyId: string, id: string, actor: SaleActor): Promise<{ reviewedAt: string }> {
  const sale = await readableSale(companyId, id, actor);
  if (!sale) throw new SaleRefusal(SALE_NOT_FOUND, 404);
  if (!sale.reviewReason || sale.reviewedAt) throw new SaleRefusal(`Nothing to look at on ${sale.saleNo}.`, 409);
  const reviewedAt = new Date();
  await prisma.$transaction(async (tx) => {
    const marked = await tx.retailSale.updateMany({
      where: { id: sale.id, reviewedAt: null },
      data: { reviewedAt, reviewedById: actor.userId },
    });
    if (marked.count !== 1) throw new SaleRefusal(`Nothing to look at on ${sale.saleNo}.`, 409);
    await writeRetailAuditEvent(tx, {
      actor,
      eventType: RETAIL_AUDIT_EVENTS.saleReviewed,
      entityType: "RetailSale",
      entityId: sale.id,
      payload: { saleNo: sale.saleNo, reason: sale.reviewReason },
    });
  });
  return { reviewedAt: reviewedAt.toISOString() };
}
