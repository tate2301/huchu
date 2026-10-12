import type { WhatsAppHandler } from "@/lib/messaging/whatsapp-webhook";
import { emitRetailNotification } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { writePlatformAuditEvent } from "@/lib/audit/platform";
import { RETAIL_AUDIT_EVENTS } from "@/lib/retail/audit";

/**
 * A supplier's reply on WhatsApp (40-buying W-34 "Their reply", C-04): an
 * inbound message whose sender is a supplier's WhatsApp number, or one of its
 * contacts' phones, is kept as a `RetailMessage` IN on that supplier's most
 * recently messaged open order (a draft, sent or part delivered), else on the
 * supplier. It is never queued: it arrived, so it is SENT at the time it was
 * sent. The same event twice adds nothing (its Meta id is `externalId`).
 * Whoever sent the order's last message is told. The webhook route checks
 * the signature; this only reads the event.
 */

const digitsOf = (value: string | null | undefined) => (value ?? "").replace(/\D/g, "");

export type ReplyEvent = { id: string; from: string; text: string | null; at: Date | null };

/** Keeps one reply; how many shops it landed in. */
export async function keepSupplierReply(event: ReplyEvent): Promise<number> {
  const from = digitsOf(event.from);
  if (from.length < 8) return 0;
  const at = event.at ?? new Date();
  // Every supplier, in every shop, whose own number or a live contact's is the sender's.
  const vendors = await prisma.$queryRaw<Array<{ id: string; companyId: string; name: string }>>`
    SELECT DISTINCT v.id, v."companyId", v.name FROM "Vendor" v
    LEFT JOIN "VendorContact" c ON c."vendorId" = v.id AND c."removedAt" IS NULL
    WHERE regexp_replace(coalesce(v.whatsapp, ''), '\\D', '', 'g') = ${from}
       OR regexp_replace(coalesce(v.phone, ''), '\\D', '', 'g') = ${from}
       OR regexp_replace(coalesce(c.phone, ''), '\\D', '', 'g') = ${from}`;
  let kept = 0;
  const seenCompanies = new Set<string>();
  for (const vendor of vendors) {
    // One row a shop: the same number at two suppliers of one shop goes to the first.
    if (seenCompanies.has(vendor.companyId)) continue;
    seenCompanies.add(vendor.companyId);
    const already = await prisma.retailMessage.findFirst({ where: { companyId: vendor.companyId, externalId: event.id }, select: { id: true } });
    if (already) continue;

    const order = await latestOpenOrder(vendor.companyId, vendor.id);
    const entity = order ? { type: "RetailPurchaseOrder", id: order.id } : { type: "Vendor", id: vendor.id };
    const sender = order
      ? await prisma.retailMessage.findFirst({
          where: { companyId: vendor.companyId, direction: "OUT", entityType: "RetailPurchaseOrder", entityId: order.id, createdById: { not: null } },
          orderBy: { createdAt: "desc" },
          select: { createdById: true },
        })
      : null;

    await prisma.$transaction(async (tx) => {
      await tx.retailMessage.create({
        data: {
          companyId: vendor.companyId,
          channel: "WHATSAPP",
          direction: "IN",
          to: "",
          fromNumber: `+${from}`,
          template: "reply",
          body: event.text ?? "",
          externalId: event.id,
          status: "SENT",
          sentAt: at,
          createdAt: at,
          entityType: entity.type,
          entityId: entity.id,
        },
      });
      // Written as the system: nobody in the shop did it.
      await writePlatformAuditEvent(
        {
          companyId: vendor.companyId,
          actorId: null,
          eventType: RETAIL_AUDIT_EVENTS.messageReceived,
          entityType: entity.type,
          entityId: entity.id,
          payload: { actorRole: null, actorName: null, supplier: vendor.name, body: event.text ?? "", from: `+${from}`, poNo: order?.poNo ?? null },
        },
        tx,
      );
    });
    kept += 1;

    if (order && sender?.createdById) {
      await emitRetailNotification({
        companyId: vendor.companyId,
        recipientIds: [sender.createdById],
        type: "RETAIL_ORDER_FOLLOW_UP",
        title: `${vendor.name} replied about ${order.poNo}.`,
        summary: (event.text ?? "").slice(0, 160),
        entityType: "RETAIL_PURCHASE_ORDER",
        entityId: order.id,
        viewPath: `/retail/buying/orders/${order.id}`,
      });
    }
  }
  return kept;
}

/** The supplier's open order (draft, sent or part delivered) last messaged; else the newest open one. */
async function latestOpenOrder(companyId: string, vendorId: string): Promise<{ id: string; poNo: string } | null> {
  const open = await prisma.retailPurchaseOrder.findMany({
    where: { companyId, vendorId, archivedAt: null, status: { in: ["DRAFT", "SENT", "PARTIAL"] } },
    orderBy: { createdAt: "desc" },
    select: { id: true, poNo: true },
  });
  if (open.length === 0) return null;
  const messaged = await prisma.retailMessage.findFirst({
    where: { companyId, entityType: "RetailPurchaseOrder", entityId: { in: open.map((order) => order.id) } },
    orderBy: { createdAt: "desc" },
    select: { entityId: true },
  });
  return open.find((order) => order.id === messaged?.entityId) ?? open[0]!;
}

export const orderReplyHandler: WhatsAppHandler = {
  name: "order-reply",
  async handle(event) {
    if (event.kind !== "message") return;
    await keepSupplierReply({ id: event.id, from: event.from, text: event.text, at: event.at });
  },
};
