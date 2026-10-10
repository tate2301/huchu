import { prisma } from "@/lib/prisma";

/**
 * What Meta's WhatsApp webhook delivers (C-04), as events, and the handlers
 * each kind goes to. `/api/webhooks/whatsapp` verifies the signature, then
 * hands every event here. SET-07 handles delivery statuses (the outbox's
 * messages); the units that read replies add theirs to `WHATSAPP_HANDLERS`:
 * reply matching on orders (BUY-02), STOP and opt-out (CUS-06), the owner's
 * yes to support access (ADM-10).
 */

export type WhatsAppStatusEvent = {
  kind: "status";
  /** Meta's id for the message we sent (`RetailMessage.externalId`). */
  id: string;
  status: "sent" | "delivered" | "read" | "failed" | string;
  at: Date | null;
  recipient: string | null;
  error: string | null;
};

export type WhatsAppInboundEvent = {
  kind: "message";
  id: string;
  /** The sender, digits with the country code ("263772123456"). */
  from: string;
  /** The text, or a button's or a reply's title; null for media and the like. */
  text: string | null;
  at: Date | null;
  /** The sender our message went from, when several share the app. */
  phoneNumberId: string | null;
};

export type WhatsAppEvent = WhatsAppStatusEvent | WhatsAppInboundEvent;

export type WhatsAppHandler = { name: string; handle(event: WhatsAppEvent): Promise<void> };

type Json = Record<string, unknown>;
const record = (value: unknown): Json | null =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : null;
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const text = (value: unknown): string | null => (typeof value === "string" && value ? value : null);
const when = (value: unknown): Date | null => {
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000) : null;
};

/** The events in one delivery (`entry[].changes[].value`), in order; anything else is skipped. */
export function whatsAppEvents(payload: unknown): WhatsAppEvent[] {
  const events: WhatsAppEvent[] = [];
  for (const entry of list(record(payload)?.entry)) {
    for (const change of list(record(entry)?.changes)) {
      const value = record(record(change)?.value);
      if (!value) continue;
      const phoneNumberId = text(record(value.metadata)?.phone_number_id);
      for (const raw of list(value.statuses)) {
        const status = record(raw);
        const id = text(status?.id);
        if (!status || !id) continue;
        const firstError = record(list(status.errors)[0]);
        events.push({
          kind: "status",
          id,
          status: text(status.status) ?? "",
          at: when(status.timestamp),
          recipient: text(status.recipient_id),
          error: text(firstError?.title) ?? text(firstError?.message),
        });
      }
      for (const raw of list(value.messages)) {
        const message = record(raw);
        const id = text(message?.id);
        const from = text(message?.from);
        if (!message || !id || !from) continue;
        const interactive = record(message.interactive);
        events.push({
          kind: "message",
          id,
          from,
          text:
            text(record(message.text)?.body) ??
            text(record(message.button)?.text) ??
            text(record(interactive?.button_reply)?.title) ??
            text(record(interactive?.list_reply)?.title),
          at: when(message.timestamp),
          phoneNumberId,
        });
      }
    }
  }
  return events;
}

/**
 * Delivery statuses for the outbox's messages: delivered or read marks one
 * sent (if the send's answer was lost); failed marks it failed with Meta's
 * reason. A status for a message we did not send is ignored.
 */
export const outboxStatusHandler: WhatsAppHandler = {
  name: "outbox-status",
  async handle(event) {
    if (event.kind !== "status") return;
    if (event.status === "failed") {
      await prisma.retailMessage.updateMany({
        where: { externalId: event.id },
        data: { status: "FAILED", lastError: event.error ?? "WhatsApp could not deliver it" },
      });
      return;
    }
    if (["sent", "delivered", "read"].includes(event.status)) {
      await prisma.retailMessage.updateMany({
        where: { externalId: event.id, status: { not: "SENT" } },
        data: { status: "SENT", sentAt: event.at ?? new Date(), lastError: null },
      });
    }
  },
};

/** Every handler, in the order each event visits them. Area units append theirs. */
export const WHATSAPP_HANDLERS: WhatsAppHandler[] = [outboxStatusHandler];

/** Hand each event to every handler; one that throws is logged and the rest still run. */
export async function dispatchWhatsAppEvents(
  events: WhatsAppEvent[],
  handlers: readonly WhatsAppHandler[] = WHATSAPP_HANDLERS,
): Promise<void> {
  for (const event of events) {
    for (const handler of handlers) {
      try {
        await handler.handle(event);
      } catch (error) {
        console.error(`[whatsapp-webhook] ${handler.name} failed on ${event.kind} ${event.id}`, error);
      }
    }
  }
}
