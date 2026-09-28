import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { verifySignupCode } from "@/lib/signup/service";
import { rateLimited, readSignupCookie, refusal } from "@/lib/signup/http";

const bodySchema = z.object({ code: z.string().max(12) });

export async function POST(request: NextRequest) {
  const limited = rateLimited(request, "verify", 30, 15 * 60 * 1000);
  if (limited) return limited;

  const requestId = readSignupCookie(request);
  if (!requestId) return NextResponse.json({ ok: false, reason: "NOT_FOUND" }, { status: 404 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, reason: "INVALID" }, { status: 400 });

  const result = await verifySignupCode(requestId, parsed.data.code);
  return result.ok ? NextResponse.json({ ok: true }) : refusal(result);
}
