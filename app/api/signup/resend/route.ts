import { NextResponse, type NextRequest } from "next/server";

import { resendSignupCode } from "@/lib/signup/service";
import { rateLimited, readSignupCookie, refusal } from "@/lib/signup/http";

export async function POST(request: NextRequest) {
  const limited = rateLimited(request, "resend", 10, 15 * 60 * 1000);
  if (limited) return limited;

  const requestId = readSignupCookie(request);
  if (!requestId) return NextResponse.json({ ok: false, reason: "NOT_FOUND" }, { status: 404 });

  const result = await resendSignupCode(requestId);
  return result.ok ? NextResponse.json({ ok: true }) : refusal(result);
}
