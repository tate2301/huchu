import type { RetailMessage } from "@prisma/client";

import { isEmailConfigured, sendEmail, type SendEmailInput } from "@/lib/email/send";
import { isWhatsAppConfigured, sendMedia, sendText, type SendResult } from "@/lib/messaging/whatsapp";
import { prisma } from "@/lib/prisma";
import { refreshReceiptBody } from "@/lib/retail/receipt-settings";

/**
 * The message outbox's drain (SET-07, C-03): the one place a `RetailMessage`
 * leaves the shop. The retail worker runs it every five minutes; each pass
 * sends what is queued and due (`scheduledFor` empty or past), oldest first.
 *
 * - A channel that is not set up (no Meta token, no mail key) sends nothing:
 *   its messages stay queued until it is (98-decisions C-04).
 * - Each message is claimed by moving its `attempts` on from the value read,
 *   so two workers never send the same one twice.
 * - A message whose text depends on something settled after it was queued
 *   (a receipt's fiscal line) is written again just before it goes.
 * - A refusal that will not pass on a retry (a bad number) fails it at once;
 *   anything else is tried again on the next pass, up to five tries.
 */

export const MAX_ATTEMPTS = 5;
const BATCH = 100;

type Due = Pick<
  RetailMessage,
  "id" | "companyId" | "channel" | "to" | "template" | "body" | "saleId" | "mediaUrl" | "mediaName" | "mediaKind" | "attempts"
>;

/** Templates whose text is written again just before sending. */
const REFRESH: Record<string, (message: Due) => Promise<string | null>> = {
  receipt: (message) => refreshReceiptBody(message),
};

/** An email's subject, by template; anything else is "A message from {shop}". */
const SUBJECTS: Record<string, (shop: string) => string> = {
  receipt: (shop) => `Your receipt from ${shop}`,
};

export type DrainDeps = {
  whatsAppReady: () => boolean;
  emailReady: () => boolean;
  sendText: typeof sendText;
  sendMedia: typeof sendMedia;
  sendEmail: (input: SendEmailInput) => Promise<void>;
};

const LIVE: DrainDeps = {
  whatsAppReady: () => isWhatsAppConfigured(),
  emailReady: () => isEmailConfigured(),
  sendText,
  sendMedia,
  sendEmail,
};

export type DrainResult = { sent: number; failed: number; retrying: number; waiting: number };

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

async function shopName(companyId: string, cache: Map<string, string>): Promise<string> {
  const known = cache.get(companyId);
  if (known) return known;
  const [branding, company] = await Promise.all([
    prisma.companyBranding.findUnique({ where: { companyId }, select: { tradingName: true, displayName: true } }),
    prisma.company.findUnique({ where: { id: companyId }, select: { name: true } }),
  ]);
  const name = branding?.tradingName || branding?.displayName || company?.name || "the shop";
  cache.set(companyId, name);
  return name;
}

async function deliver(message: Due, body: string, deps: DrainDeps, names: Map<string, string>): Promise<SendResult> {
  if (message.channel === "WHATSAPP") {
    return message.mediaUrl && message.mediaKind
      ? deps.sendMedia(message.to, { url: message.mediaUrl, kind: message.mediaKind, name: message.mediaName, caption: body })
      : deps.sendText(message.to, body);
  }
  const shop = await shopName(message.companyId, names);
  try {
    await deps.sendEmail({
      to: message.to,
      subject: (SUBJECTS[message.template] ?? ((name: string) => `A message from ${name}`))(shop),
      text: body,
      html: `<pre style="font-family:'IBM Plex Mono',ui-monospace,monospace;font-size:13px;line-height:1.5">${escapeHtml(body)}</pre>`,
      sender: { name: shop },
    });
    return { ok: true, id: null };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "The email did not go", retry: true };
  }
}

/** One pass of the outbox, across every shop. */
export async function drainOutbox(now: Date = new Date(), deps: DrainDeps = LIVE): Promise<DrainResult> {
  const ready = { WHATSAPP: deps.whatsAppReady(), EMAIL: deps.emailReady() };
  const channels = (Object.keys(ready) as Array<keyof typeof ready>).filter((channel) => ready[channel]);
  const due = { status: "QUEUED" as const, OR: [{ scheduledFor: null }, { scheduledFor: { lte: now } }] };
  const waiting = await prisma.retailMessage.count({ where: { ...due, channel: { notIn: channels } } });
  const result: DrainResult = { sent: 0, failed: 0, retrying: 0, waiting };
  if (channels.length === 0) return result;

  const messages = await prisma.retailMessage.findMany({
    where: { ...due, channel: { in: channels } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: BATCH,
    select: {
      id: true,
      companyId: true,
      channel: true,
      to: true,
      template: true,
      body: true,
      saleId: true,
      mediaUrl: true,
      mediaName: true,
      mediaKind: true,
      attempts: true,
    },
  });
  const names = new Map<string, string>();

  for (const message of messages) {
    const claimed = await prisma.retailMessage.updateMany({
      where: { id: message.id, status: "QUEUED", attempts: message.attempts },
      data: { attempts: { increment: 1 } },
    });
    if (claimed.count !== 1) continue;
    const attempts = message.attempts + 1;

    const refresh = REFRESH[message.template];
    const body = (refresh ? await refresh(message).catch(() => null) : null) ?? message.body;
    const sent = await deliver(message, body, deps, names);

    if (sent.ok) {
      await prisma.retailMessage.update({
        where: { id: message.id },
        data: { status: "SENT", sentAt: new Date(), externalId: sent.id, lastError: null, body },
      });
      result.sent += 1;
    } else if (sent.retry && attempts < MAX_ATTEMPTS) {
      await prisma.retailMessage.update({ where: { id: message.id }, data: { lastError: sent.error, body } });
      result.retrying += 1;
    } else {
      await prisma.retailMessage.update({ where: { id: message.id }, data: { status: "FAILED", lastError: sent.error, body } });
      result.failed += 1;
    }
  }
  return result;
}

/** The worker's line: "2 sent, 1 failed, 4 waiting for WhatsApp to be set up". */
export function drainWords(result: DrainResult): string {
  const parts = [`${result.sent} sent`];
  if (result.failed) parts.push(`${result.failed} failed`);
  if (result.retrying) parts.push(`${result.retrying} to try again`);
  if (result.waiting) parts.push(`${result.waiting} waiting for a channel to be set up`);
  return parts.join(", ");
}
