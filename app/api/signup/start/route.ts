import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { getSelfServeProductBySlug } from "@/lib/platform/products";
import { startSignup } from "@/lib/signup/service";
import { rateLimited, refusal, setSignupCookie } from "@/lib/signup/http";

const bodySchema = z.object({
  product: z.string().max(40),
  name: z.string().max(200),
  email: z.string().max(320),
  attribution: z.record(z.string(), z.string().max(500)).optional(),
});

export async function POST(request: NextRequest) {
  const limited = rateLimited(request, "start", 10, 15 * 60 * 1000);
  if (limited) return limited;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, reason: "INVALID_REQUEST" }, { status: 400 });

  const product = getSelfServeProductBySlug(parsed.data.product);
  if (!product) return NextResponse.json({ ok: false, reason: "NOT_FOUND" }, { status: 404 });

  const result = await startSignup({
    product,
    name: parsed.data.name,
    email: parsed.data.email,
    attribution: parsed.data.attribution,
  });
  if (!result.ok) return refusal(result);

  const response = NextResponse.json({ ok: true, email: result.email });
  setSignupCookie(response, request, result.requestId);
  return response;
}
