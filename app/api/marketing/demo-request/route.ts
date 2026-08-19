import { NextResponse } from "next/server";
import { z } from "zod";

import { getMarketingDemoWebhookUrl, getMarketingSchedulerUrl } from "@/lib/marketing-site";
import {
  MARKETING_LEAD_SOURCES,
  deliverLeadWebhook,
  readRefererContext,
  readUtmFields,
  recordMarketingLead,
} from "@/lib/marketing/leads";

const demoRequestSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(160),
  company: z.string().trim().min(2).max(160),
  industry: z.string().trim().min(2).max(64),
  teamSize: z.string().trim().min(1).max(32),
  message: z.string().trim().min(10).max(4000),
  phone: z.string().trim().max(40).optional(),
  city: z.string().trim().max(80).optional(),
  locations: z.string().trim().max(80).optional(),
  currentTools: z.string().trim().max(500).optional(),
  problemArea: z.string().trim().max(160).optional(),
  timeline: z.string().trim().max(80).optional(),
  preferredChannel: z.string().trim().max(64).optional(),
  source: z.string().trim().min(1).max(64).optional(),
  // Plan, product, or route context captured from the page the visitor came from.
  interest: z.string().trim().max(200).optional(),
  website: z.string().trim().max(200).optional(),
  pagePath: z.string().trim().max(300).optional(),
  utmSource: z.string().trim().max(200).optional(),
  utmMedium: z.string().trim().max(200).optional(),
  utmCampaign: z.string().trim().max(200).optional(),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = demoRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: "Please complete all required demo request fields." },
        { status: 400 },
      );
    }

    const payload = {
      ...parsed.data,
      submittedAt: new Date().toISOString(),
    };

    if (payload.website) {
      return NextResponse.json({
        ok: true,
        submittedAt: payload.submittedAt,
        scheduleUrl: getMarketingSchedulerUrl(),
      });
    }

    // MK-3. The row comes first and the webhook second, always. The previous
    // order had no row at all: with `MARKETING_DEMO_WEBHOOK_URL` unset or the
    // endpoint down, a completed form ended in `console.error` on a server
    // nobody reads, and the visitor was told it had been received.
    const referer = readRefererContext(request.headers.get("referer"));
    const posted = readUtmFields(parsed.data as Record<string, unknown>);

    const lead = await recordMarketingLead({
      source: parsed.data.source ?? MARKETING_LEAD_SOURCES.DEMO_REQUEST,
      name: parsed.data.name,
      email: parsed.data.email,
      phone: parsed.data.phone,
      companyName: parsed.data.company,
      message: parsed.data.message,
      // The questionnaire answers are what makes the first call specific, so
      // they are kept whole rather than flattened into the message body.
      payload: {
        industry: parsed.data.industry,
        teamSize: parsed.data.teamSize,
        city: parsed.data.city ?? null,
        locations: parsed.data.locations ?? null,
        currentTools: parsed.data.currentTools ?? null,
        problemArea: parsed.data.problemArea ?? null,
        timeline: parsed.data.timeline ?? null,
        preferredChannel: parsed.data.preferredChannel ?? null,
        interest: parsed.data.interest ?? null,
      },
      pagePath: parsed.data.pagePath ?? referer.pagePath,
      utmSource: posted.utmSource ?? referer.utmSource,
      utmMedium: posted.utmMedium ?? referer.utmMedium,
      utmCampaign: posted.utmCampaign ?? referer.utmCampaign,
    });

    // Delivery is a convenience for whoever watches the CRM. It cannot fail the
    // request, because failing it would ask the visitor to submit a lead that
    // has already been captured — and the second copy is the one that gets
    // called twice.
    await deliverLeadWebhook({
      url: getMarketingDemoWebhookUrl(),
      payload: { ...payload, leadId: lead.id },
      leadId: lead.id,
    });

    return NextResponse.json({
      ok: true,
      submittedAt: payload.submittedAt,
      scheduleUrl: getMarketingSchedulerUrl(),
    });
  } catch (error) {
    console.error("[marketing] demo request error", error);

    return NextResponse.json(
      { ok: false, error: "We could not submit the demo request. Please try again." },
      { status: 500 },
    );
  }
}
