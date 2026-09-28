import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { logAuthEvent } from "@/lib/auth-core/events";
import { checkRateLimit } from "@/lib/auth-core/rate-limit";
import { prisma } from "@/lib/prisma";

/**
 * A person changing their own password — the Change verb on the profile board's
 * Password row.
 *
 * This is not `/api/users/password-reset`, and it could not have been. That
 * route is an administrator acting on somebody else: it is gated on
 * `canMutateUserManagement` (SUPERADMIN only), it takes the `userId` of another
 * account, and it never asks for the password being replaced because an admin
 * does not know it. Pointing the profile row at it would have meant every
 * manager, clerk and teacher getting a 403 on their own account, and the one
 * role it did work for could change any password in the workspace without
 * proving it knew the old one.
 *
 * So: same hashing (bcrypt, cost 12), same audit reflex, plus the two things
 * self-service needs — the current password is verified, and the id is taken
 * from the session rather than the body, so this endpoint cannot be aimed at
 * anybody else.
 *
 * Both writers move `User.passwordChangedAt`, this one and the admin reset, so
 * the date on the board is the date the password last changed regardless of who
 * changed it.
 */
const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1).max(200),
    // Matches `/api/users/password-reset`'s bound exactly. A stricter policy
    // belongs in one place shared by both, not invented here for one of them.
    newPassword: z.string().min(8).max(200),
  })
  .refine((value) => value.currentPassword !== value.newPassword, {
    message: "The new password must be different from the current one",
    path: ["newPassword"],
  });

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    // A current-password check is a guessing oracle, and an unattended signed-in
    // browser is the attack it invites. Ten attempts a minute per account is
    // generous for a person typing and useless for a script.
    const limit = checkRateLimit({
      key: `preferences-password:${session.user.id}`,
      limit: 10,
      windowMs: 60_000,
    });
    if (!limit.allowed) {
      return NextResponse.json(
        { error: "Too many attempts. Please try again shortly." },
        { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
      );
    }

    const body = await request.json();
    const validated = changePasswordSchema.parse(body);

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, companyId: true, email: true, password: true },
    });

    if (!user || user.companyId !== session.user.companyId) {
      return errorResponse("Profile not found", 404);
    }

    // An OAuth account has no hash to compare against. Setting one from here
    // would create a second way into the account without anybody proving they
    // hold the first, so it is refused rather than quietly allowed.
    if (!user.password) {
      return errorResponse("This account signs in without a password.", 400);
    }

    const currentMatches = await bcrypt.compare(validated.currentPassword, user.password);
    if (!currentMatches) {
      await logAuthEvent({
        eventType: "auth.password.change.failed",
        actor: user.email.toLowerCase(),
        companyId: user.companyId,
        reason: "CURRENT_PASSWORD_MISMATCH",
        entityType: "user",
        entityId: user.id,
      });
      return errorResponse("Current password is incorrect.", 400);
    }

    const passwordHash = await bcrypt.hash(validated.newPassword, 12);
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { password: passwordHash, passwordChangedAt: new Date() },
      select: { id: true, passwordChangedAt: true },
    });

    await logAuthEvent({
      eventType: "auth.password.changed",
      actor: user.email.toLowerCase(),
      companyId: user.companyId,
      entityType: "user",
      entityId: user.id,
      payload: { self: true },
    });

    return successResponse(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] POST /api/preferences/password error:", error);
    return errorResponse("Failed to change password");
  }
}
