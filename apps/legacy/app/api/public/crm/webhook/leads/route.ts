import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { checkRateLimit } from "@/lib/auth-core/rate-limit";
import { verifyApiKey } from "@/lib/crm/api-keys";
import { ingestLead } from "@/lib/crm/intake-ingest";

const webhookSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    email: z.string().trim().email().max(200).optional(),
    phone: z.string().trim().max(40).optional(),
    phoneCountry: z.string().trim().max(8).optional(),
    message: z.string().trim().max(4000).optional(),
    services: z.array(z.string().trim().max(80)).max(40).optional(),
    source: z.string().trim().max(120).optional(),
    // Declared attribution channel: MANUAL | WEB_FORM | WEBHOOK | SOCIAL |
    // ADS | REFERRAL | OTHER. Falls back to the API key's default channel,
    // then to UTM/source-based derivation.
    channel: z.string().trim().max(20).optional(),
    utm_source: z.string().trim().max(120).optional(),
    utm_medium: z.string().trim().max(120).optional(),
    utm_campaign: z.string().trim().max(120).optional(),
    utm_term: z.string().trim().max(120).optional(),
    utm_content: z.string().trim().max(120).optional(),
    referrer: z.string().trim().max(500).optional(),
    landing_page: z.string().trim().max(500).optional(),
  })
  .refine((v) => v.email || v.phone, { message: "Provide at least an email or phone" });

function bearerOrHeaderKey(request: NextRequest): string | null {
  const headerKey = request.headers.get("x-api-key");
  if (headerKey) return headerKey.trim();
  const auth = request.headers.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  return null;
}

/**
 * Public webhook: create a CRM lead from an external website form.
 * Authenticated by a per-company CRM API key (x-api-key or Bearer).
 */
export async function POST(request: NextRequest) {
  const rawKey = bearerOrHeaderKey(request);
  const keyRow = await verifyApiKey(rawKey);
  if (!keyRow) {
    return NextResponse.json({ ok: false, error: "Invalid or missing API key" }, { status: 401 });
  }

  const limit = checkRateLimit({ key: `crm-webhook:${keyRow.id}`, limit: 60, windowMs: 60_000 });
  if (!limit.allowed) {
    return NextResponse.json(
      { ok: false, error: "Rate limit exceeded" },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body" }, { status: 400 });
  }

  const parsed = webhookSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Validation failed", issues: parsed.error.issues }, { status: 400 });
  }
  const data = parsed.data;

  try {
    const result = await ingestLead({
      companyId: keyRow.companyId,
      apiKeyId: keyRow.id,
      contactName: data.name,
      email: data.email ?? null,
      phone: data.phone ?? null,
      phoneCountry: data.phoneCountry ?? null,
      selectedServices: data.services ?? [],
      message: data.message ?? null,
      source: data.source ?? keyRow.defaultSourceLabel ?? "webhook",
      origin: "WEBHOOK",
      explicitChannel: data.channel ?? keyRow.defaultChannel,
      utmSource: data.utm_source ?? null,
      utmMedium: data.utm_medium ?? null,
      utmCampaign: data.utm_campaign ?? null,
      utmTerm: data.utm_term ?? null,
      utmContent: data.utm_content ?? null,
      referrer: data.referrer ?? null,
      landingPage: data.landing_page ?? null,
    });
    return NextResponse.json({ ok: true, leadId: result.leadId, leadNo: result.leadNo }, { status: 201 });
  } catch (error) {
    console.error("[API] POST /api/public/crm/webhook/leads error:", error);
    return NextResponse.json({ ok: false, error: "Failed to create lead" }, { status: 500 });
  }
}
