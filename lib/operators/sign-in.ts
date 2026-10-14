import bcrypt from "bcryptjs";

import { prisma } from "@/lib/prisma";
import { recordOperatorEvent } from "@/lib/operators/audit";
import { openSecret, sealSecret } from "@/lib/operators/secret-box";
import {
  findSession,
  markSessionVerified,
  startPendingSession,
  endSession,
  type FoundSession,
  type SessionMeta,
} from "@/lib/operators/session";
import { acceptedStep, authenticatorUri, newAuthenticatorSecret } from "@/lib/operators/totp";

/**
 * Signing an operator in: a password, then an authenticator code.
 *
 * Five wrong answers in a row, of either kind, lock the sign-in for fifteen
 * minutes. The count is the operator's, not the browser's, so moving to
 * another machine does not buy more guesses.
 */

export const MAX_FAILED_ATTEMPTS = 5;
export const LOCK_MS = 15 * 60 * 1000;
export const MIN_PASSWORD_LENGTH = 12;
const BCRYPT_COST = 12;

/**
 * Compared against when the email is unknown, so an unknown email takes as
 * long to refuse as a wrong password and the page cannot be used to find out
 * who is an operator.
 */
const DECOY_HASH = bcrypt.hashSync("decoy-password-never-matches", BCRYPT_COST);

export function hashOperatorPassword(password: string) {
  return bcrypt.hash(password, BCRYPT_COST);
}

export type PasswordResult =
  | { ok: true; token: string; next: "code" | "set-up" }
  | { ok: false; reason: "mismatch" }
  | { ok: false; reason: "locked"; until: Date };

export async function checkPassword(
  input: { email: string; password: string } & SessionMeta,
  now = new Date(),
): Promise<PasswordResult> {
  const email = input.email.trim().toLowerCase();
  const operator = email
    ? await prisma.operator.findUnique({
        where: { email },
        select: {
          id: true,
          passwordHash: true,
          totpConfirmedAt: true,
          failedAttempts: true,
          lockedUntil: true,
          deactivatedAt: true,
        },
      })
    : null;

  const usable = operator && !operator.deactivatedAt && operator.passwordHash ? operator : null;
  const matches = await bcrypt.compare(input.password, usable?.passwordHash ?? DECOY_HASH);

  if (!usable) return { ok: false, reason: "mismatch" };

  if (usable.lockedUntil && usable.lockedUntil > now) {
    return { ok: false, reason: "locked", until: usable.lockedUntil };
  }

  if (!matches) {
    const locked = await countFailure(usable.id, usable.failedAttempts, "password", now);
    return locked ? { ok: false, reason: "locked", until: locked } : { ok: false, reason: "mismatch" };
  }

  const token = await startPendingSession(usable.id, input, now);
  return { ok: true, token, next: usable.totpConfirmedAt ? "code" : "set-up" };
}

/** Counts one wrong answer; returns when the lock ends if this one locked it. */
async function countFailure(
  operatorId: string,
  failedAttempts: number,
  step: "password" | "code",
  now: Date,
): Promise<Date | null> {
  const attempts = failedAttempts + 1;
  const lockedUntil = attempts >= MAX_FAILED_ATTEMPTS ? new Date(now.getTime() + LOCK_MS) : null;
  await prisma.operator.update({
    where: { id: operatorId },
    data: lockedUntil ? { failedAttempts: 0, lockedUntil } : { failedAttempts: attempts },
  });
  await recordOperatorEvent({
    operatorId,
    eventType: lockedUntil ? "operator.sign_in_locked" : "operator.sign_in_refused",
    entityType: "operator",
    entityId: operatorId,
    payload: { step, attempts },
  });
  return lockedUntil;
}

/** The pending session behind a token, while it is still waiting for its code. */
export async function findPendingSession(token: string | null | undefined, now = new Date()) {
  const session = await findSession(token, now);
  return session && !session.verifiedAt ? session : null;
}

export type CodeResult =
  | { ok: true }
  | { ok: false; reason: "expired" }
  | { ok: false; reason: "wrong" }
  | { ok: false; reason: "locked"; until: Date };

/** The authenticator code, for an operator who has one set up. */
export async function checkCode(token: string | null | undefined, code: string, now = new Date()) {
  const session = await findPendingSession(token, now);
  if (!session?.operator.totpSecret || !session.operator.totpConfirmedAt) {
    return { ok: false, reason: "expired" } satisfies CodeResult;
  }
  return acceptCode(session, openSecret(session.operator.totpSecret), code, now, false);
}

/**
 * The secret to scan, for an operator setting up their authenticator.
 *
 * Made once per set-up and kept until a code confirms it, so reloading the
 * page does not change the QR code under someone halfway through scanning.
 */
export async function authenticatorToSetUp(token: string | null | undefined, now = new Date()) {
  const session = await findPendingSession(token, now);
  if (!session || session.operator.totpConfirmedAt) return null;
  let secret = session.operator.totpSecret ? openSecret(session.operator.totpSecret) : null;
  if (!secret) {
    secret = newAuthenticatorSecret();
    await prisma.operator.update({
      where: { id: session.operator.id },
      data: { totpSecret: sealSecret(secret) },
    });
  }
  return { secret, uri: authenticatorUri(secret, session.operator.email), email: session.operator.email };
}

/** The first code from a newly scanned authenticator, which also confirms it. */
export async function confirmAuthenticator(token: string | null | undefined, code: string, now = new Date()) {
  const session = await findPendingSession(token, now);
  if (!session?.operator.totpSecret || session.operator.totpConfirmedAt) {
    return { ok: false, reason: "expired" } satisfies CodeResult;
  }
  return acceptCode(session, openSecret(session.operator.totpSecret), code, now, true);
}

async function acceptCode(
  session: FoundSession,
  secret: string,
  code: string,
  now: Date,
  confirming: boolean,
): Promise<CodeResult> {
  const { operator } = session;
  if (operator.lockedUntil && operator.lockedUntil > now) {
    await endSession(session.id, now);
    return { ok: false, reason: "locked", until: operator.lockedUntil };
  }

  const step = acceptedStep(secret, code, operator.totpLastStep, now.getTime());
  if (step === null) {
    const locked = await countFailure(operator.id, operator.failedAttempts, "code", now);
    if (locked) {
      await endSession(session.id, now);
      return { ok: false, reason: "locked", until: locked };
    }
    return { ok: false, reason: "wrong" };
  }

  await prisma.operator.update({
    where: { id: operator.id },
    data: {
      totpLastStep: step,
      failedAttempts: 0,
      lockedUntil: null,
      lastSignInAt: now,
      ...(confirming ? { totpConfirmedAt: now } : {}),
    },
  });
  await markSessionVerified(session.id, now);
  if (confirming) {
    await recordOperatorEvent({
      operatorId: operator.id,
      eventType: "operator.authenticator_set_up",
      entityType: "operator",
      entityId: operator.id,
    });
  }
  await recordOperatorEvent({
    operatorId: operator.id,
    eventType: "operator.signed_in",
    entityType: "operator",
    entityId: operator.id,
  });
  return { ok: true };
}
