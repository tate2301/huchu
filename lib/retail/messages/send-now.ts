import { isWhatsAppConfigured, sendTemplate, WHATSAPP_NOT_SET_UP } from "@/lib/messaging/whatsapp";
import { prisma } from "@/lib/prisma";

/**
 * A WhatsApp that cannot wait in the outbox (80-admin W-57): an invite or a
 * new till PIN carries the PIN, and the PIN is never stored. It is sent at
 * once, through the same adapter and approved template as everything the
 * outbox sends ({{1}} the shop, {{2}} the message), and logged as a
 * `RetailMessage` with the secret blanked out ("••••"), SENT or FAILED with
 * the reason. Nothing retries it: a failed send hands the secret to the person
 * who issued it instead (the hand-over panel).
 */

export type Sent = { whatsapp: boolean; error?: string };

export const SECRET_MARK = "••••";

async function shopName(companyId: string): Promise<string> {
  const [branding, company] = await Promise.all([
    prisma.companyBranding.findUnique({ where: { companyId }, select: { tradingName: true, displayName: true } }),
    prisma.company.findUnique({ where: { id: companyId }, select: { name: true } }),
  ]);
  return branding?.tradingName || branding?.displayName || company?.name || "the shop";
}

export async function sendWhatsAppNow(input: {
  companyId: string;
  to: string;
  /** The approved template's name: "staff-invite", "staff-pin". */
  template: string;
  /** The message with its secret in it. */
  body: string;
  /** The secrets to blank out of the logged copy. */
  secrets: string[];
  createdById: string | null;
  deps?: { ready: () => boolean; send: typeof sendTemplate };
}): Promise<Sent> {
  const ready = input.deps?.ready ?? isWhatsAppConfigured;
  const send = input.deps?.send ?? sendTemplate;
  const logged = input.secrets.filter(Boolean).reduce((text, secret) => text.split(secret).join(SECRET_MARK), input.body);

  const result = ready()
    ? await send(input.to, { name: input.template, params: [await shopName(input.companyId), input.body] })
    : ({ ok: false, error: WHATSAPP_NOT_SET_UP, retry: false } as const);

  await prisma.retailMessage.create({
    data: {
      companyId: input.companyId,
      channel: "WHATSAPP",
      to: input.to,
      template: input.template,
      body: logged,
      status: result.ok ? "SENT" : "FAILED",
      attempts: 1,
      lastError: result.ok ? null : result.error,
      externalId: result.ok ? result.id : null,
      sentAt: result.ok ? new Date() : null,
      createdById: input.createdById,
    },
  });
  return result.ok ? { whatsapp: true } : { whatsapp: false, error: result.error };
}
