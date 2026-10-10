/**
 * Meta's WhatsApp webhook: `GET/POST /api/webhooks/whatsapp` (SET-07, C-04).
 *
 * The one public callback a Meta app has. `GET` answers the subscribe
 * challenge with `META_WHATSAPP_VERIFY_TOKEN`. `POST` checks the delivery's
 * `X-Hub-Signature-256` against `META_WHATSAPP_APP_SECRET` (401 when it does
 * not match, so nothing unsigned is read), then hands each event to the
 * handlers in `lib/messaging/whatsapp-webhook.ts` and answers 200 — Meta
 * retries anything else, and a handler's trouble is ours, not theirs.
 *
 * Unauthenticated by design: Meta has no session. `/api/*` is outside the
 * proxy's matcher, so no tenant or sign-in gate stands in front of it.
 */
import { NextRequest, NextResponse } from "next/server";

import { verifyWhatsAppSignature, whatsAppChallenge } from "@/lib/messaging/whatsapp";
import { dispatchWhatsAppEvents, whatsAppEvents } from "@/lib/messaging/whatsapp-webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const challenge = whatsAppChallenge(request.nextUrl.searchParams, process.env.META_WHATSAPP_VERIFY_TOKEN);
  if (challenge === null) return NextResponse.json({ error: "That is not this app's verify token." }, { status: 403 });
  return new NextResponse(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
}

export async function POST(request: NextRequest) {
  // The bytes as delivered: the signature is over them, not over re-serialised JSON.
  const rawBody = await request.text();
  if (!verifyWhatsAppSignature(rawBody, request.headers.get("x-hub-signature-256"), process.env.META_WHATSAPP_APP_SECRET)) {
    return NextResponse.json({ error: "The signature does not match." }, { status: 401 });
  }
  let payload: unknown = null;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    payload = null;
  }
  await dispatchWhatsAppEvents(whatsAppEvents(payload));
  return NextResponse.json({ ok: true });
}
