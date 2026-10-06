import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * WhatsApp through Meta's Cloud API (SET-07, C-04): the one adapter every
 * WhatsApp the shop sends goes through, and the checks its webhook needs.
 * Called by the outbox drain only (`lib/retail/messages/drain.ts`), never from
 * a request, so a slow or refused send never holds up a sale.
 *
 * Configured by four environment values; with no token or phone number id,
 * nothing is sent and messages wait in the outbox (98-decisions C-04).
 *
 *   META_WHATSAPP_TOKEN            a system user's access token
 *   META_WHATSAPP_PHONE_NUMBER_ID  the shop's WhatsApp sender
 *   META_WHATSAPP_VERIFY_TOKEN     what the webhook's GET challenge must carry
 *   META_WHATSAPP_APP_SECRET       what Meta signs webhook deliveries with
 */

const GRAPH_VERSION = "v21.0";
const SEND_TIMEOUT_MS = 15_000;

export type WhatsAppConfig = { token: string; phoneNumberId: string };

export function whatsAppConfig(env: Record<string, string | undefined> = process.env): WhatsAppConfig | null {
  const token = env.META_WHATSAPP_TOKEN?.trim();
  const phoneNumberId = env.META_WHATSAPP_PHONE_NUMBER_ID?.trim();
  return token && phoneNumberId ? { token, phoneNumberId } : null;
}

export function isWhatsAppConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return whatsAppConfig(env) !== null;
}

export const WHATSAPP_NOT_SET_UP = "WhatsApp is not set up";

/** The number as Meta takes it: digits only, country code first ("+263 77 212 3456" → "263772123456"). */
export function whatsAppNumber(to: string): string | null {
  const digits = to.replace(/[^\d]/g, "");
  return digits.length >= 8 && digits.length <= 15 ? digits : null;
}

export type SendResult = { ok: true; id: string | null } | { ok: false; error: string; retry: boolean };

type Fetch = typeof fetch;

async function post(config: WhatsAppConfig, payload: Record<string, unknown>, fetcher: Fetch): Promise<SendResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);
  try {
    const response = await fetcher(`https://graph.facebook.com/${GRAPH_VERSION}/${config.phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", ...payload }),
      signal: controller.signal,
    });
    const body = (await response.json().catch(() => null)) as
      | { messages?: Array<{ id?: string }>; error?: { message?: string; code?: number } }
      | null;
    if (response.ok) return { ok: true, id: body?.messages?.[0]?.id ?? null };
    const error = body?.error?.message ?? `WhatsApp answered ${response.status}`;
    // A refusal for the message itself (a bad number, a closed window) will not pass on a retry; a busy or broken service may.
    return { ok: false, error, retry: response.status === 429 || response.status >= 500 };
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "AbortError";
    return { ok: false, error: timedOut ? "WhatsApp did not answer in time" : "WhatsApp could not be reached", retry: true };
  } finally {
    clearTimeout(timer);
  }
}

/** Send a text message. */
export async function sendText(
  to: string,
  body: string,
  options: { config?: WhatsAppConfig | null; fetcher?: Fetch } = {},
): Promise<SendResult> {
  const config = options.config === undefined ? whatsAppConfig() : options.config;
  if (!config) return { ok: false, error: WHATSAPP_NOT_SET_UP, retry: true };
  const number = whatsAppNumber(to);
  if (!number) return { ok: false, error: `${to} is not a WhatsApp number`, retry: false };
  return post(config, { to: number, type: "text", text: { preview_url: false, body } }, options.fetcher ?? fetch);
}

/**
 * Send a picture or a document by its address, the text as its caption (C-02:
 * the one media path; orders, statements and insight pictures use it).
 */
export async function sendMedia(
  to: string,
  media: { url: string; kind: "IMAGE" | "DOCUMENT"; name?: string | null; caption?: string | null },
  options: { config?: WhatsAppConfig | null; fetcher?: Fetch } = {},
): Promise<SendResult> {
  const config = options.config === undefined ? whatsAppConfig() : options.config;
  if (!config) return { ok: false, error: WHATSAPP_NOT_SET_UP, retry: true };
  const number = whatsAppNumber(to);
  if (!number) return { ok: false, error: `${to} is not a WhatsApp number`, retry: false };
  const caption = media.caption?.trim() ? { caption: media.caption } : {};
  const payload =
    media.kind === "IMAGE"
      ? { type: "image", image: { link: media.url, ...caption } }
      : { type: "document", document: { link: media.url, ...(media.name ? { filename: media.name } : {}), ...caption } };
  return post(config, { to: number, ...payload }, options.fetcher ?? fetch);
}

/* ── The webhook's checks ─────────────────────────────────────────────────── */

/** Whether a delivery's `X-Hub-Signature-256` is Meta's HMAC of the raw body under the app secret. */
export function verifyWhatsAppSignature(rawBody: string, header: string | null, secret: string | null | undefined): boolean {
  if (!secret || !header?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  const given = header.slice("sha256=".length);
  if (given.length !== expected.length || !/^[0-9a-f]+$/i.test(given)) return false;
  return timingSafeEqual(Buffer.from(given, "hex"), Buffer.from(expected, "hex"));
}

/** The answer to Meta's subscribe challenge, or null when the token does not match. */
export function whatsAppChallenge(params: URLSearchParams, verifyToken: string | null | undefined): string | null {
  if (!verifyToken) return null;
  if (params.get("hub.mode") !== "subscribe" || params.get("hub.verify_token") !== verifyToken) return null;
  return params.get("hub.challenge");
}
