import { writePlatformAuditEvent } from "@/lib/audit/platform";
import type { WhatsAppHandler } from "@/lib/messaging/whatsapp-webhook";
import { prisma } from "@/lib/prisma";
import { RETAIL_AUDIT_EVENTS } from "@/lib/retail/audit";

/**
 * STOP on WhatsApp (CUS-06, C-04): a customer who replies "STOP" (any case,
 * any spacing) stops marketing messages. Every live customer with that
 * WhatsApp number (`whatsapp`, else `phone`), in every shop, has consent
 * turned off, with `RETAIL_CUSTOMER.CONSENT_CHANGED { agreed: false, via:
 * "STOP reply" }` written as the system; an offer still waiting for them in
 * the outbox is not sent. Delivery statuses stay `outboxStatusHandler`'s.
 */

export const STOP_VIA = "STOP reply";
export const STOPPED_BEFORE_SENDING = "They replied STOP before it went";

export function isStopReply(text: string | null): boolean {
  return (text ?? "").trim().toUpperCase() === "STOP";
}

/** Turns marketing off for everyone on that number; how many it turned off. */
export async function stopMarketing(from: string, at: Date = new Date()): Promise<number> {
  const digits = from.replace(/\D/g, "");
  if (digits.length < 8) return 0;
  const customers = await prisma.$queryRaw<Array<{ id: string; companyId: string }>>`
    SELECT c.id, c."companyId" FROM "Customer" c
    WHERE c."archivedAt" IS NULL AND c."mergedIntoId" IS NULL AND c."marketingConsent"
      AND regexp_replace(coalesce(nullif(trim(c.whatsapp), ''), c.phone, ''), '\\D', '', 'g') = ${digits}`;
  for (const customer of customers) {
    await prisma.$transaction(async (tx) => {
      await tx.customer.update({ where: { id: customer.id }, data: { marketingConsent: false, consentChangedAt: at } });
      await tx.retailMessage.updateMany({
        where: { customerId: customer.id, status: "QUEUED", template: "customer-offer" },
        data: { status: "FAILED", lastError: STOPPED_BEFORE_SENDING },
      });
      await writePlatformAuditEvent(
        {
          companyId: customer.companyId,
          actorId: null,
          eventType: RETAIL_AUDIT_EVENTS.customerConsent,
          entityType: "Customer",
          entityId: customer.id,
          payload: { actorRole: null, actorName: null, agreed: false, via: STOP_VIA, automatic: true },
        },
        tx,
      );
    });
  }
  return customers.length;
}

export const stopHandler: WhatsAppHandler = {
  name: "customer-stop",
  async handle(event) {
    if (event.kind !== "message" || !isStopReply(event.text)) return;
    await stopMarketing(event.from, event.at ?? new Date());
  },
};
