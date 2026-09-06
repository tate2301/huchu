import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { checkRateLimit } from "@corelithzw/platform/auth-core/rate-limit";
import { getApprovalByToken, respondToApproval } from "@/lib/crm/approvals";

const respondSchema = z.object({
  action: z.enum(["APPROVE", "DECLINE"]),
  note: z.string().trim().max(1000).optional(),
  name: z.string().trim().max(160).optional(),
  website: z.string().max(0).optional(), // honeypot
});

function clientIp(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const view = await getApprovalByToken(token);
  if (!view) {
    return NextResponse.json({ ok: false, error: "Document not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, document: view });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const limit = checkRateLimit({ key: `crm-approval:${token}:${clientIp(request)}`, limit: 10, windowMs: 60_000 });
  if (!limit.allowed) {
    return NextResponse.json(
      { ok: false, error: "Too many attempts. Please try again shortly." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body" }, { status: 400 });
  }

  const parsed = respondSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid response" }, { status: 400 });
  }
  if (parsed.data.website) {
    return NextResponse.json({ ok: true, status: "PENDING" });
  }

  try {
    const result = await respondToApproval({
      token,
      action: parsed.data.action,
      note: parsed.data.note ?? null,
      name: parsed.data.name ?? null,
    });
    return NextResponse.json({ ok: true, status: result.status });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Could not record your response" },
      { status: 400 },
    );
  }
}
