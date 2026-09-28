import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { buildWorkspaceUrl } from "@/lib/platform/tenant-url";
import { createWorkspaceFromSignup } from "@/lib/signup/service";
import { browserUrl, clearSignupCookie, rateLimited, readSignupCookie, refusal } from "@/lib/signup/http";

const bodySchema = z.object({
  businessName: z.string().max(200),
  slug: z.string().max(80),
  whatsapp: z.string().max(40),
});

export async function POST(request: NextRequest) {
  const limited = rateLimited(request, "workspace", 10, 15 * 60 * 1000);
  if (limited) return limited;

  const requestId = readSignupCookie(request);
  if (!requestId) return NextResponse.json({ ok: false, reason: "NOT_FOUND" }, { status: 404 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, reason: "INVALID_REQUEST" }, { status: 400 });

  const result = await createWorkspaceFromSignup(requestId, parsed.data);
  if (!result.ok) return refusal(result);

  const welcome = new URLSearchParams({ token: result.handoffToken, next: result.homePath });
  const redirectUrl = buildWorkspaceUrl({
    slug: result.companySlug,
    path: `/signup/welcome?${welcome.toString()}`,
    currentUrl: browserUrl(request),
  });

  const response = NextResponse.json({ ok: true, redirectUrl: redirectUrl.toString() });
  clearSignupCookie(response);
  return response;
}
