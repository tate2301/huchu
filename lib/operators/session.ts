import { createHash, randomBytes } from "node:crypto";

import { prisma } from "@/lib/prisma";

export { OPERATOR_COOKIE } from "@/lib/operators/cookie";

/**
 * Operator sessions: a random token in an httpOnly cookie, its SHA-256 in
 * `OperatorSession`, and a database read on every request.
 *
 * Not a JWT, on purpose. Removing an operator, or an owner pressing "sign out
 * everywhere", has to end the session on the next click, not when a signed
 * token runs out.
 */

/** Between the password and the code. */
export const PENDING_TTL_MS = 5 * 60 * 1000;
/** A working day, however busy. */
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
/** Two idle hours end it: a portal left open on a shared desk. */
export const IDLE_TTL_MS = 2 * 60 * 60 * 1000;
/** `lastSeenAt` is written at most this often. */
const TOUCH_EVERY_MS = 60 * 1000;

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export type SessionMeta = { ipAddress?: string | null; userAgent?: string | null };

/** A session that has had the password but not yet the code. */
export async function startPendingSession(operatorId: string, meta: SessionMeta, now = new Date()) {
  const token = randomBytes(32).toString("base64url");
  await prisma.operatorSession.create({
    data: {
      operatorId,
      tokenHash: hashSessionToken(token),
      expiresAt: new Date(now.getTime() + PENDING_TTL_MS),
      lastSeenAt: now,
      ipAddress: meta.ipAddress ?? null,
      userAgent: meta.userAgent?.slice(0, 300) ?? null,
    },
  });
  return token;
}

export async function markSessionVerified(sessionId: string, now = new Date()) {
  await prisma.operatorSession.update({
    where: { id: sessionId },
    data: { verifiedAt: now, lastSeenAt: now, expiresAt: new Date(now.getTime() + SESSION_TTL_MS) },
  });
}

const OPERATOR_FIELDS = {
  id: true,
  email: true,
  name: true,
  role: true,
  totpSecret: true,
  totpConfirmedAt: true,
  totpLastStep: true,
  failedAttempts: true,
  lockedUntil: true,
  deactivatedAt: true,
} as const;

/**
 * The session a token belongs to, while it is good: not ended, not past its
 * time, not idle too long, and its operator not removed. Null otherwise; the
 * reasons are not told apart, because the answer to all of them is the
 * sign-in page.
 */
export async function findSession(token: string | null | undefined, now = new Date()) {
  const value = token?.trim();
  if (!value) return null;
  const session = await prisma.operatorSession.findUnique({
    where: { tokenHash: hashSessionToken(value) },
    select: {
      id: true,
      verifiedAt: true,
      expiresAt: true,
      lastSeenAt: true,
      revokedAt: true,
      operator: { select: OPERATOR_FIELDS },
    },
  });
  if (!session || session.revokedAt || session.expiresAt <= now || session.operator.deactivatedAt) {
    return null;
  }
  if (session.verifiedAt && now.getTime() - session.lastSeenAt.getTime() > IDLE_TTL_MS) {
    return null;
  }
  if (session.verifiedAt && now.getTime() - session.lastSeenAt.getTime() > TOUCH_EVERY_MS) {
    await prisma.operatorSession.update({ where: { id: session.id }, data: { lastSeenAt: now } });
  }
  return session;
}

export type FoundSession = NonNullable<Awaited<ReturnType<typeof findSession>>>;

export async function endSession(sessionId: string, now = new Date()) {
  await prisma.operatorSession.updateMany({
    where: { id: sessionId, revokedAt: null },
    data: { revokedAt: now },
  });
}

export async function endEverySession(operatorId: string, now = new Date()) {
  await prisma.operatorSession.updateMany({
    where: { operatorId, revokedAt: null },
    data: { revokedAt: now },
  });
}

export function sessionCookieOptions(maxAgeMs: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: Math.floor(maxAgeMs / 1000),
  };
}
