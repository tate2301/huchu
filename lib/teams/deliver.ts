import { createHmac, timingSafeEqual } from "node:crypto";

import type { InviteChannel } from "@prisma/client";

import { sendEmail } from "@/lib/email/send";
import { isWhatsAppConfigured, sendText, whatsAppConfig } from "@/lib/messaging/whatsapp";

import { hashToken } from "./invites";

/**
 * Sending an invite, and the six digits the person types to join from it.
 *
 * `createInvite` makes the link and hands the token back once; this puts it in a message. WhatsApp goes
 * through the shop's Meta sender when it is set up. Where it is not, a development server writes the message to
 * its log so the flow can be walked, and anywhere else the invite is marked not delivered, which is the
 * failure W2-F draws.
 */

export type Delivery = { ok: true } | { ok: false; reason: string };

export function joinUrl(origin: string, token: string): string {
  return `${origin.replace(/\/$/, "")}/join/${encodeURIComponent(token)}`;
}

function logged(to: string, message: string): Delivery {
  console.info(`[teams] to ${to}: ${message}`);
  return { ok: true };
}

export async function deliverInvite(input: {
  channel: InviteChannel;
  phone: string | null;
  email: string | null;
  workspace: string;
  invitedBy: string;
  origin: string;
  token: string;
}): Promise<Delivery> {
  const url = joinUrl(input.origin, input.token);
  const text = `${input.invitedBy} invited you to ${input.workspace}. Join here: ${url}`;
  if (input.channel === "EMAIL" && input.email) {
    try {
      await sendEmail({ to: input.email, subject: `${input.invitedBy} invited you to ${input.workspace}`, text, html: `<p>${input.invitedBy} invited you to ${input.workspace}.</p><p><a href="${url}">Join ${input.workspace}</a></p>`, sender: { name: input.workspace } });
      return { ok: true };
    } catch (error) {
      if (process.env.NODE_ENV !== "production") return logged(input.email, text);
      return { ok: false, reason: error instanceof Error ? error.message : "The email could not be sent." };
    }
  }
  if (!input.phone) return { ok: false, reason: "There is no number to send it to." };
  if (!isWhatsAppConfigured()) {
    return process.env.NODE_ENV !== "production" ? logged(input.phone, text) : { ok: false, reason: "WhatsApp is not set up." };
  }
  const sent = await sendText(input.phone, text, { config: whatsAppConfig() });
  return sent.ok ? { ok: true } : { ok: false, reason: sent.error };
}

// The code: six digits from the invite and the ten minutes it is asked in, so nothing is stored.

const WINDOW_MS = 10 * 60_000;

function secret(): string {
  return process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || "teams-join-dev";
}

function codeAt(token: string, window: number): string {
  const digest = createHmac("sha256", secret()).update(`join:${hashToken(token)}:${window}`).digest();
  return String(digest.readUInt32BE(0) % 1_000_000).padStart(6, "0");
}

export function joinCode(token: string, now = new Date()): string {
  return codeAt(token, Math.floor(now.getTime() / WINDOW_MS));
}

/** Right for this ten minutes or the one before. */
export function joinCodeMatches(token: string, given: string, now = new Date()): boolean {
  const window = Math.floor(now.getTime() / WINDOW_MS);
  const want = [codeAt(token, window), codeAt(token, window - 1)];
  const digits = given.replace(/\D/g, "");
  return want.some((code) => code.length === digits.length && timingSafeEqual(Buffer.from(code), Buffer.from(digits)));
}

/** Send the six digits to the number the invite was sent to. */
export async function sendJoinCode(input: { phone: string; token: string; now?: Date }): Promise<Delivery> {
  const message = `Your Corelith code is ${joinCode(input.token, input.now)}`;
  if (!isWhatsAppConfigured()) return process.env.NODE_ENV !== "production" ? logged(input.phone, message) : { ok: false, reason: "WhatsApp is not set up." };
  const sent = await sendText(input.phone, message, { config: whatsAppConfig() });
  return sent.ok ? { ok: true } : { ok: false, reason: sent.error };
}
