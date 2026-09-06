import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@corelithzw/db/client";
import { checkRateLimit } from "@corelithzw/platform/auth-core/rate-limit";
import { buildSubmissionSchema, parseIntakeFormConfig } from "@/lib/crm/intake-schema";
import { ingestLead } from "@/lib/crm/intake-ingest";

// Only accept photo URLs that came from our own blob store — arbitrary
// external URLs would otherwise be rendered as <img> inside the CRM.
function isOwnBlobUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname.endsWith(".blob.vercel-storage.com");
  } catch {
    return false;
  }
}

function clientIp(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

/**
 * Public: submit an intake form. No auth; the token identifies the tenant +
 * form. Rate-limited per token+IP, honeypot-protected.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const limit = checkRateLimit({ key: `crm-intake:${token}:${clientIp(request)}`, limit: 10, windowMs: 60_000 });
  if (!limit.allowed) {
    return NextResponse.json(
      { ok: false, error: "Too many submissions. Please try again shortly." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  const form = await prisma.crmIntakeForm.findFirst({
    where: { publicToken: token, isActive: true },
    select: { id: true, companyId: true, fields: true, services: true, allowPhotos: true, maxPhotos: true, defaultAssigneeId: true, successMessage: true },
  });
  if (!form) {
    return NextResponse.json({ ok: false, error: "Form not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body" }, { status: 400 });
  }

  let config;
  try {
    config = parseIntakeFormConfig(form.fields, form.services);
  } catch {
    return NextResponse.json({ ok: false, error: "Form is misconfigured" }, { status: 500 });
  }

  const parsed = buildSubmissionSchema(config).safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Please complete the required fields.", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const data = parsed.data;

  // Honeypot filled → silently accept without creating anything.
  if (data.website) {
    return NextResponse.json({ ok: true, message: form.successMessage ?? "Thank you." });
  }

  const photoUrls = form.allowPhotos
    ? (data.photoUrls ?? []).filter(isOwnBlobUrl).slice(0, form.maxPhotos)
    : [];

  try {
    const result = await ingestLead({
      companyId: form.companyId,
      formId: form.id,
      contactName: data.contactName,
      email: data.email ?? null,
      phone: data.phone ?? null,
      phoneCountry: data.phoneCountry ?? null,
      selectedServices: data.selectedServices ?? [],
      answers: data.answers ?? {},
      photoUrls,
      message: data.message ?? null,
      source: data.source ?? "intake-form",
      utmSource: data.utmSource ?? null,
      utmMedium: data.utmMedium ?? null,
      utmCampaign: data.utmCampaign ?? null,
      utmTerm: data.utmTerm ?? null,
      utmContent: data.utmContent ?? null,
      referrer: data.referrer ?? null,
      landingPage: data.landingPage ?? null,
      defaultAssigneeId: form.defaultAssigneeId,
      origin: "WEB_FORM",
    });
    return NextResponse.json({ ok: true, message: form.successMessage ?? "Thank you.", leadNo: result.leadNo });
  } catch (error) {
    console.error("[API] POST /api/public/crm/intake/[token]/submit error:", error);
    return NextResponse.json({ ok: false, error: "We could not submit your enquiry. Please try again." }, { status: 500 });
  }
}
