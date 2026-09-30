/**
 * Meta's Lead Ads callback: `/api/public/crm/webhook/facebook`.
 *
 * One URL for the whole deployment, because a Meta app has exactly one webhook
 * and one app serves every tenant. Which workspace a delivery belongs to is
 * decided from the Page it names, not from the URL it arrived on.
 *
 * Unauthenticated by design — Meta has no session and cannot send a header of
 * ours. Authenticity is the `X-Hub-Signature-256` over the delivered bytes,
 * checked in `lib/crm/facebook/webhook.ts` against the app secret before
 * anything else happens.
 *
 * The route is thin on purpose. It does the three things the handler cannot:
 * reads the raw bytes, flattens the headers, and turns an outcome into a
 * status code. `GET` is Meta's subscription handshake and answers plain text,
 * because Meta compares the body to `hub.challenge` byte for byte and a JSON
 * envelope fails the handshake with a 200.
 */
import { NextRequest, NextResponse } from "next/server";

import { checkRateLimit } from "@/lib/auth-core/rate-limit";
import { handleFacebookWebhook, verifyWebhookSubscription } from "@/lib/crm/facebook/webhook";

// node:crypto all the way down this path.
export const runtime = "nodejs";
// A webhook delivery must never be served from a cache.
export const dynamic = "force-dynamic";

export function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams;

  const result = verifyWebhookSubscription({
    mode: query.get("hub.mode"),
    verifyToken: query.get("hub.verify_token"),
    challenge: query.get("hub.challenge"),
  });

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
  }

  return new NextResponse(result.challenge, {
    status: 200,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

export async function POST(request: NextRequest) {
  // One limit for the endpoint, because there is one endpoint. Meta batches
  // deliveries, so this sits far above real traffic and far below a flood;
  // an unsigned POST is refused by the signature check for the cost of one
  // hash, without a database lookup.
  const limit = checkRateLimit({ key: "fb-webhook", limit: 3000, windowMs: 60_000 });
  if (!limit.allowed) {
    return NextResponse.json(
      { ok: false, error: "Rate limit exceeded" },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  // `text()`, never `json()`: the signature is over the bytes as delivered,
  // and re-serialising a parsed body changes them.
  const rawBody = await request.text();

  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value;
  });

  try {
    const result = await handleFacebookWebhook({ rawBody, headers });
    return NextResponse.json(
      {
        ok: result.httpStatus < 400,
        outcome: result.outcome,
        results: result.results,
        ...(result.error ? { error: result.error } : {}),
      },
      { status: result.httpStatus },
    );
  } catch (error) {
    console.error("[API] POST /api/public/crm/webhook/facebook error:", error);
    // 500 rather than a swallowed 200: an unexpected failure here is ours, and
    // Meta's retry is the only thing standing between it and a lost lead.
    return NextResponse.json({ ok: false, error: "Failed to process delivery" }, { status: 500 });
  }
}
