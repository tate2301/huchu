import { prisma } from "@/lib/prisma";
import { sendWhatsAppNow, type Sent } from "@/lib/retail/messages/send-now";

/**
 * What People sends a person on WhatsApp, at once and never queued, because
 * it carries a PIN (`sendWhatsAppNow`). When it cannot go, the PIN comes back
 * to the person who issued it, once, for the hand-over panel.
 */

export async function shopName(companyId: string): Promise<string> {
  const [branding, company] = await Promise.all([
    prisma.companyBranding.findUnique({ where: { companyId }, select: { tradingName: true, displayName: true } }),
    prisma.company.findUnique({ where: { id: companyId }, select: { name: true } }),
  ]);
  return branding?.tradingName || branding?.displayName || company?.name || "the shop";
}

/** "Your new till PIN for Harare Bottle Store is 4829. You choose your own the first time you use it." */
export function pinMessage(shop: string, pin: string): string {
  return `Your new till PIN for ${shop} is ${pin}. You choose your own the first time you use it.`;
}

export async function sendPin(input: {
  companyId: string;
  phone: string | null;
  pin: string;
  createdById: string;
}): Promise<{ sent: Sent; handOver?: { link: null; pin: string } }> {
  if (!input.phone) return { sent: { whatsapp: false, error: "No phone" }, handOver: { link: null, pin: input.pin } };
  const sent = await sendWhatsAppNow({
    companyId: input.companyId,
    to: input.phone,
    template: "staff-pin",
    body: pinMessage(await shopName(input.companyId), input.pin),
    secrets: [input.pin],
    createdById: input.createdById,
  });
  return sent.whatsapp ? { sent } : { sent, handOver: { link: null, pin: input.pin } };
}
