/**
 * The till PIN, set and cleared.
 *
 * S-7.5. Read `lib/retail/till-pin.ts` first — it carries the threat model and the
 * reason a four-digit code is allowed to exist at all.
 *
 * ── The one rule this file enforces ────────────────────────────────────────
 *
 * **A PIN is issued by a password, never by another PIN.** Setting one, changing
 * one and clearing one all require the caller's own account password, compared
 * with bcrypt against `User.password`.
 *
 * Without that rule the lock would be circular: a colleague standing at an
 * unlocked, unattended till could set their own four digits and lock the real
 * cashier out of their own session. The session being open is not authority to
 * mint the thing that reopens it. The cashier signed in with their password this
 * morning, so being asked for it again to change a PIN costs nothing and is the
 * only place the credential model has an anchor.
 *
 * Nothing here ever returns a PIN. There is no recovery path and there is not
 * meant to be one — a forgotten PIN is replaced.
 */

import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";

import { errorResponse, successResponse } from "@corelithzw/platform/api-response";
import { prisma } from "@corelithzw/db/client";
import { isTillPinLocked, tillPinDenial } from "../../../../../till-pin";
import { requireRetailPermission } from "../../../../../permissions";
import { requireRetailSession } from "../../_helpers";

/** The same cost factor the platform hashes passwords at. */
const PIN_HASH_ROUNDS = 10;

const setPinSchema = z.object({
  /** Four digits. Validated by `tillPinDenial`, which owns what a PIN may be. */
  pin: z.string().min(1).max(12),
  /** The caller's own account password. */
  password: z.string().min(1).max(200),
});

const clearPinSchema = z.object({
  password: z.string().min(1).max(200),
});

/**
 * Compares the caller's own password.
 *
 * A failure is deliberately not distinguished from "you have no password set"
 * (an OAuth-only account): both come back as the same refusal, because the
 * difference is not the caller's business and is a way to enumerate accounts.
 */
async function passwordMatches(userId: string, companyId: string, password: string) {
  const user = await prisma.user.findFirst({
    where: { id: userId, companyId, isActive: true },
    select: { password: true },
  });
  if (!user?.password) return false;
  return bcrypt.compare(password, user.password);
}

export async function GET(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) {
    return response as NextResponse;
  }

  // Only people who stand at a till have one.
  /*
    R-2.4. `retail.sell` `view`, on all three methods, and that is not a
    slip.

    The matrix answers one question here — may this person be at a till at all —
    and there is no second, row-level question to ask, because the row is always
    the caller's own: every query below is keyed on `session.user.id`. What
    authorises the change is the account password compared with bcrypt a few
    lines down, which is the rule this file exists to enforce. Gating the write
    on `update` would have read as stricter and been meaningless: no role that
    may work a till holds it, so the feature would simply have stopped working.
  */
  const gate = requireRetailPermission(session, "retail.sell", "view");
  if (gate) return gate;

  const record = await prisma.retailTillPin.findFirst({
    where: { userId: session.user.id, companyId: session.user.companyId },
    // `pinHash` is not in this list on purpose, and must never be.
    select: { lockedUntil: true, lastUnlockedAt: true, updatedAt: true },
  });

  const locked = record
    ? isTillPinLocked(
        { failedAttempts: 0, lockedUntil: record.lockedUntil },
        new Date(),
      )
    : false;

  return successResponse({
    data: {
      configured: Boolean(record),
      locked,
      lockedUntil: locked ? record?.lockedUntil ?? null : null,
      lastUnlockedAt: record?.lastUnlockedAt ?? null,
      updatedAt: record?.updatedAt ?? null,
    },
  });
}

export async function PUT(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) {
    return response as NextResponse;
  }

  /*
    R-2.4. `retail.sell` `view`, on all three methods, and that is not a
    slip.

    The matrix answers one question here — may this person be at a till at all —
    and there is no second, row-level question to ask, because the row is always
    the caller's own: every query below is keyed on `session.user.id`. What
    authorises the change is the account password compared with bcrypt a few
    lines down, which is the rule this file exists to enforce. Gating the write
    on `update` would have read as stricter and been meaningless: no role that
    may work a till holds it, so the feature would simply have stopped working.
  */
  const gate = requireRetailPermission(session, "retail.sell", "view");
  if (gate) return gate;

  try {
    const input = setPinSchema.parse(await request.json());

    const denial = tillPinDenial(input.pin);
    if (denial) return errorResponse(denial, 400);

    if (!(await passwordMatches(session.user.id, session.user.companyId, input.password))) {
      return errorResponse("That password is not right.", 403);
    }

    const pinHash = await bcrypt.hash(input.pin, PIN_HASH_ROUNDS);

    await prisma.retailTillPin.upsert({
      where: { userId: session.user.id },
      // A new PIN clears whatever the old one accumulated. The person proved who
      // they are with a password, so leaving them inside a lockout would be a
      // punishment for having fixed the problem.
      update: { pinHash, failedAttempts: 0, lockedUntil: null, companyId: session.user.companyId },
      create: { userId: session.user.id, companyId: session.user.companyId, pinHash },
      select: { id: true },
    });

    return successResponse({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    // The message is not echoed: an exception raised while a PIN is in scope is
    // exactly the kind of thing that ends up in a log with the digits attached.
    console.error("[API] PUT /api/v2/retail/pos/pin failed");
    return errorResponse("Could not save that PIN");
  }
}

export async function DELETE(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) {
    return response as NextResponse;
  }

  /*
    R-2.4. `retail.sell` `view`, on all three methods, and that is not a
    slip.

    The matrix answers one question here — may this person be at a till at all —
    and there is no second, row-level question to ask, because the row is always
    the caller's own: every query below is keyed on `session.user.id`. What
    authorises the change is the account password compared with bcrypt a few
    lines down, which is the rule this file exists to enforce. Gating the write
    on `update` would have read as stricter and been meaningless: no role that
    may work a till holds it, so the feature would simply have stopped working.
  */
  const gate = requireRetailPermission(session, "retail.sell", "view");
  if (gate) return gate;

  try {
    const input = clearPinSchema.parse(await request.json());

    if (!(await passwordMatches(session.user.id, session.user.companyId, input.password))) {
      return errorResponse("That password is not right.", 403);
    }

    await prisma.retailTillPin.deleteMany({
      where: { userId: session.user.id, companyId: session.user.companyId },
    });

    return successResponse({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] DELETE /api/v2/retail/pos/pin failed");
    return errorResponse("Could not turn the PIN off");
  }
}
