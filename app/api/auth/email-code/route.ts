import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { logAuthEvent } from "@/lib/auth-core/events";
import { issueEmailCode, normaliseEmail } from "@/lib/auth-core/email-code";
import { sendEmailCodeMail } from "@/lib/auth-core/email-code-mail";
import { resolveSignInScope } from "@/lib/auth-core/sign-in-scope";
import { getProduct } from "@/lib/platform/products";
import { getHostHeaderFromRequestHeaders } from "@/lib/platform/tenant";
import { rateLimited } from "@/lib/signup/http";

const bodySchema = z.object({ email: z.string().max(320) });

/**
 * Send a sign-in code.
 *
 * The answer is the same whether or not the address has an account here, so
 * this cannot be used to find out who works where. Only a real, active account
 * in the workspace this host serves is actually sent a code.
 */
export async function POST(request: NextRequest) {
  const limited = rateLimited(request, "sign-in-code", 10, 15 * 60 * 1000);
  if (limited) return limited;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  const email = parsed.success ? normaliseEmail(parsed.data.email) : "";
  if (!email.includes("@")) return NextResponse.json({ ok: false, reason: "INVALID_EMAIL" }, { status: 400 });

  const hostHeader = getHostHeaderFromRequestHeaders(request.headers);
  const scope = await resolveSignInScope(hostHeader);
  if (!scope.ok) return NextResponse.json({ ok: false, reason: scope.reason }, { status: 400 });

  const user = await prisma.user.findFirst({
    where: {
      email: { equals: email, mode: "insensitive" },
      isActive: true,
      ...(scope.companyId ? { companyId: scope.companyId } : {}),
    },
    select: { email: true, companyId: true, company: { select: { product: true } } },
  });
  if (!user) return NextResponse.json({ ok: true });

  // A throttled address gets the same answer as an unknown one. Telling them
  // apart would say which addresses have accounts here. The form shows its own
  // resend countdown, and the last code sent still works.
  const issued = await issueEmailCode({ email: user.email, purpose: "SIGN_IN" });
  if (!issued.ok) return NextResponse.json({ ok: true });

  try {
    await sendEmailCodeMail({
      to: user.email,
      code: issued.code,
      productName: getProduct(user.company.product).name,
      purpose: "SIGN_IN",
    });
  } catch (error) {
    console.error("[auth] sign-in code email failed", error);
    return NextResponse.json({ ok: false, reason: "EMAIL_FAILED" }, { status: 502 });
  }

  await logAuthEvent({
    eventType: "auth.email-code.sent",
    actor: user.email,
    companyId: user.companyId,
    entityType: "auth-strategy",
    entityId: "email-code",
  });
  return NextResponse.json({ ok: true });
}
