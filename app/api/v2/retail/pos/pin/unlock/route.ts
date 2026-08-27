/**
 * Unlocking a locked till.
 *
 * S-7.5. The session is already open — `requireRetailSession` has just proved it —
 * so this endpoint grants nothing. It answers one question: are these the four
 * digits that turn the lock screen off. The lock is a screen over an authenticated
 * terminal, not a door into the system, and this route is deliberately incapable
 * of being anything else: it issues no token, sets no cookie, and changes no
 * permission.
 *
 * The lockout rule lives in `lib/retail/till-pin.ts` and is tested there. This
 * file reads the counter, asks the rule, and writes the counter back.
 *
 * The lock is checked **before** bcrypt runs. A locked terminal must not do the
 * hashing work — that keeps a lockout cheap under a script, and it keeps the
 * response time from telling a guesser whether their digits were wrong or merely
 * late.
 */

import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";

import { errorResponse, successResponse } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { evaluateTillPinAttempt } from "@/lib/retail/till-pin";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { requireRetailSession } from "../../../_helpers";

const unlockSchema = z.object({
  pin: z.string().min(1).max(12),
});

export async function POST(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) {
    return response as NextResponse;
  }

  // R-2.4. Same reasoning as `../route.ts`: the lock is a screen over an
  // already-authenticated terminal, the row is the caller's own, and the four
  // digits are what is actually being checked.
  const gate = requireRetailPermission(session, "retail.sell", "view");
  if (gate) return gate;

  try {
    const input = unlockSchema.parse(await request.json());

    const record = await prisma.retailTillPin.findFirst({
      where: { userId: session.user.id, companyId: session.user.companyId },
      select: { id: true, pinHash: true, failedAttempts: true, lockedUntil: true },
    });

    if (!record) {
      // Nothing to unlock. The screen should never have been showing.
      return errorResponse("No PIN is set for this account.", 409);
    }

    const now = new Date();
    const state = { failedAttempts: record.failedAttempts, lockedUntil: record.lockedUntil };

    const lockCheck = evaluateTillPinAttempt({ state, verified: null, now });
    if (lockCheck.decision === "LOCKED") {
      return errorResponse(
        "Too many wrong PINs. Sign in with your password to carry on.",
        423,
        { retryAfterMs: lockCheck.retryAfterMs, attemptsRemaining: 0 },
      );
    }

    const verified = await bcrypt.compare(input.pin, record.pinHash);
    const outcome = evaluateTillPinAttempt({ state, verified, now });

    await prisma.retailTillPin.update({
      where: { id: record.id },
      data: {
        failedAttempts: outcome.next.failedAttempts,
        lockedUntil: outcome.next.lockedUntil,
        ...(outcome.decision === "ACCEPTED" ? { lastUnlockedAt: now } : {}),
      },
      select: { id: true },
    });

    if (outcome.decision === "ACCEPTED") {
      return successResponse({ ok: true });
    }

    if (outcome.decision === "REJECTED_NOW_LOCKED") {
      return errorResponse(
        "Too many wrong PINs. Sign in with your password to carry on.",
        423,
        { retryAfterMs: outcome.retryAfterMs, attemptsRemaining: 0 },
      );
    }

    return errorResponse("That PIN is not right.", 401, {
      attemptsRemaining: outcome.attemptsRemaining,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] POST /api/v2/retail/pos/pin/unlock failed");
    return errorResponse("Could not check that PIN");
  }
}
