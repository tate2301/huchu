import { NextResponse } from "next/server";
import { z } from "zod";

import { getMarketingDemoWebhookUrl } from "@/lib/marketing-site";
import {
  MARKETING_LEAD_SOURCES,
  MAX_LEAD_PAYLOAD_CHARS,
  deliverLeadWebhook,
  normaliseLeadSource,
  readRefererContext,
  readUtmFields,
  recordMarketingLead,
} from "@/lib/marketing/leads";

/**
 * MK-3. The capture endpoint the free tools post to.
 *
 * `/api/marketing/demo-request` is a form with six required fields; a tool is
 * not. Somebody using the penalty calculator has already told us the most
 * valuable thing about them — eleven tills, four months in default — and asking
 * them to complete a questionnaire before we will keep that is how the number
 * gets lost. So everything except `source` is optional here, and the tool's own
 * inputs travel in `payload`.
 */

const leadSchema = z.object({
  source: z.string().trim().min(1).max(64),
  name: z.string().trim().max(160).optional(),
  email: z.string().trim().email().max(200).optional(),
  phone: z.string().trim().max(60).optional(),
  companyName: z.string().trim().max(200).optional(),
  message: z.string().trim().max(8000).optional(),
  /** Tool inputs and results — the calculator's tills and days live here. */
  payload: z.record(z.string(), z.unknown()).optional(),
  pagePath: z.string().trim().max(300).optional(),
  utmSource: z.string().trim().max(200).optional(),
  utmMedium: z.string().trim().max(200).optional(),
  utmCampaign: z.string().trim().max(200).optional(),
  /** Honeypot. A real visitor never fills this in. */
  website: z.string().trim().max(200).optional(),
});

function hasSubstance(data: z.infer<typeof leadSchema>): boolean {
  return Boolean(
    data.email ||
      data.phone ||
      data.name ||
      data.companyName ||
      data.message ||
      (data.payload && Object.keys(data.payload).length > 0),
  );
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = leadSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: "That submission could not be read." },
        { status: 400 },
      );
    }

    const submittedAt = new Date().toISOString();

    // Answer the bot exactly as we answer a person: a spam filter that reports
    // itself teaches the next bot how to get past it.
    if (parsed.data.website) {
      return NextResponse.json({ ok: true, submittedAt });
    }

    if (!hasSubstance(parsed.data)) {
      return NextResponse.json(
        { ok: false, error: "Nothing was submitted to record." },
        { status: 400 },
      );
    }

    const referer = readRefererContext(request.headers.get("referer"));
    const posted = readUtmFields(parsed.data as Record<string, unknown>);
    const source = normaliseLeadSource(parsed.data.source, MARKETING_LEAD_SOURCES.OTHER);

    let lead;
    try {
      lead = await recordMarketingLead({
        source,
        name: parsed.data.name,
        email: parsed.data.email,
        phone: parsed.data.phone,
        companyName: parsed.data.companyName,
        message: parsed.data.message,
        payload: parsed.data.payload ?? null,
        pagePath: parsed.data.pagePath ?? referer.pagePath,
        utmSource: posted.utmSource ?? referer.utmSource,
        utmMedium: posted.utmMedium ?? referer.utmMedium,
        utmCampaign: posted.utmCampaign ?? referer.utmCampaign,
      });
    } catch (error) {
      // An oversized payload is the caller's mistake and is worth saying so,
      // rather than reporting a server fault the caller cannot act on.
      const message = error instanceof Error ? error.message : "";
      if (message.includes(String(MAX_LEAD_PAYLOAD_CHARS))) {
        return NextResponse.json(
          { ok: false, error: "That submission is too large to record." },
          { status: 400 },
        );
      }
      throw error;
    }

    // Same ordering as the demo form: the lead is durable before anything that
    // can fail over the network is attempted.
    await deliverLeadWebhook({
      url: getMarketingDemoWebhookUrl(),
      payload: {
        source: lead.source,
        submittedAt,
        name: parsed.data.name ?? null,
        email: parsed.data.email ?? null,
        phone: parsed.data.phone ?? null,
        companyName: parsed.data.companyName ?? null,
        message: parsed.data.message ?? null,
        payload: parsed.data.payload ?? null,
        leadId: lead.id,
      },
      leadId: lead.id,
    });

    return NextResponse.json({ ok: true, submittedAt });
  } catch (error) {
    console.error("[marketing] lead capture error", error);

    return NextResponse.json(
      { ok: false, error: "We could not record that. Please try again." },
      { status: 500 },
    );
  }
}
