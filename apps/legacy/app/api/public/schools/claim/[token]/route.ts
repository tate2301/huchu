import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  InviteError,
  MIN_PORTAL_PASSWORD_LENGTH,
  claimPortalInvite,
  findClaimableInvite,
} from "@corelithzw/module-campus/portal-invites";

/**
 * Claiming a portal account.
 *
 * No session — the token in the URL is the capability, the same contract as
 * `/api/public/crm/sign-off`. The `select` in `findClaimableInvite` is the
 * boundary: the response names who the invite is for and nothing else about
 * the school.
 *
 * Every failure — unknown, expired, withdrawn, already used — returns the same
 * 404 on GET, so the endpoint cannot be used to sort guessed tokens into
 * "wrong" and "used". POST distinguishes them, because by then the caller
 * holds a token that was valid enough to reach a password form and needs to be
 * told what to do next.
 */

const claimSchema = z.object({
  password: z.string().min(MIN_PORTAL_PASSWORD_LENGTH).max(200),
  name: z.string().trim().min(1).max(120).optional(),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    const invite = await findClaimableInvite(token);

    if (!invite) {
      return NextResponse.json(
        { error: "This invitation link is not valid or has expired" },
        { status: 404 },
      );
    }

    return NextResponse.json({
      data: {
        subject: invite.subject,
        sentTo: invite.sentTo,
        displayName: invite.displayName,
        reference: invite.reference,
        expiresAt: invite.expiresAt,
        minPasswordLength: MIN_PORTAL_PASSWORD_LENGTH,
      },
    });
  } catch (error) {
    console.error("[API] GET /api/public/schools/claim/[token] error:", error);
    return NextResponse.json({ error: "Could not open this invitation" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    const validated = claimSchema.parse(await request.json());

    const result = await claimPortalInvite({
      token,
      password: validated.password,
      name: validated.name,
    });

    return NextResponse.json({
      data: {
        email: result.user.email,
        subject: result.subject,
        // Where to send them once the account exists.
        signInPath:
          result.subject === "STUDENT" ? "/portal/student/login" : "/portal/parent/login",
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: `Choose a password of at least ${MIN_PORTAL_PASSWORD_LENGTH} characters`,
        },
        { status: 400 },
      );
    }
    if (error instanceof InviteError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[API] POST /api/public/schools/claim/[token] error:", error);
    return NextResponse.json({ error: "Could not set up this account" }, { status: 500 });
  }
}
