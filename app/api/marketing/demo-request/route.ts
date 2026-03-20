import { NextResponse } from "next/server";
import { z } from "zod";

import { getMarketingDemoWebhookUrl, getMarketingSchedulerUrl } from "@/lib/marketing-site";

const demoRequestSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(160),
  company: z.string().trim().min(2).max(160),
  industry: z.string().trim().min(2).max(64),
  teamSize: z.string().trim().min(1).max(32),
  message: z.string().trim().min(10).max(4000),
  source: z.string().trim().min(1).max(64).optional(),
  website: z.string().trim().max(200).optional(),
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

    const webhookUrl = getMarketingDemoWebhookUrl();

    if (webhookUrl) {
      const webhookResponse = await fetch(webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!webhookResponse.ok) {
        console.error("[marketing] demo webhook failed", {
          status: webhookResponse.status,
        });

        return NextResponse.json(
          { ok: false, error: "We could not deliver the demo request. Please try again." },
          { status: 502 },
        );
      }
    } else {
      console.info("[marketing] demo request", payload);
    }

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
