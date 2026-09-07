/**
 * Payment gateway callbacks: `POST /api/webhooks/payments/{provider}`.
 *
 * One route for all three candidate gateways, because the provider is a path
 * segment rather than a compiled-in choice. Switching gateways after SS-4.1
 * means pointing the new gateway's dashboard at its own segment and setting
 * `PAYMENT_PROVIDER` — no new route, no redeploy of the billing page.
 *
 * The route is deliberately thin. It does exactly three things the handler
 * cannot: it reads the raw bytes, it flattens the headers, and it turns the
 * handler's outcome into a status code. Everything that decides anything lives
 * in `lib/payments/webhook.ts`, where it can be tested without a request.
 *
 * Unauthenticated by design — the gateway has no session. Authenticity comes
 * from the adapter's `verifyWebhook`, and an unverified delivery is recorded
 * and refused rather than dropped.
 */
import { NextRequest, NextResponse } from "next/server";

import { handlePaymentWebhook } from "@/lib/payments/webhook";

// node:crypto and node:https are used all the way down this path.
export const runtime = "nodejs";
// A gateway callback must never be served from a cache.
export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ provider: string }> };

export async function POST(request: NextRequest, { params }: RouteParams) {
  const { provider } = await params;

  // `text()`, never `json()`: every signature scheme these gateways use signs
  // the bytes as delivered, and Paynow does not send JSON at all.
  const rawBody = await request.text();

  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    headers[key] = value;
  });

  const result = await handlePaymentWebhook({ provider, rawBody, headers });

  return NextResponse.json(
    {
      ok: result.httpStatus < 400,
      outcome: result.outcome,
      eventId: result.eventId ?? null,
      ...(result.error ? { error: result.error } : {}),
    },
    { status: result.httpStatus },
  );
}
