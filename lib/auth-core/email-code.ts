import { createHmac, randomInt, timingSafeEqual } from "crypto";
import type { EmailCodePurpose } from "@prisma/client";

import { prisma } from "@/lib/prisma";

/**
 * Six-digit codes sent by email: to prove an address at signup, and to sign in
 * without a password.
 *
 * A code is stored only as an HMAC keyed with the auth secret, so the table
 * alone cannot be used to sign anybody in. Only the newest code for an address
 * and purpose works: sending a new one retires the old, so a code left in an
 * old email stops working the moment a fresh one is asked for.
 */

export const EMAIL_CODE_LENGTH = 6;
export const EMAIL_CODE_TTL_MS = 10 * 60 * 1000;
/** Wrong guesses a single code survives. Six digits and five tries is 1 in 200,000. */
export const EMAIL_CODE_MAX_ATTEMPTS = 5;
/** How soon the same address can be sent another code. */
export const EMAIL_CODE_RESEND_AFTER_MS = 30 * 1000;
/** Codes one address can be sent in an hour, whatever else is going on. */
export const EMAIL_CODE_HOURLY_LIMIT = 10;

const HOUR_MS = 60 * 60 * 1000;
const CODE_PATTERN = /^\d{6}$/;

export type IssueEmailCodeResult =
  | { ok: true; code: string; expiresAt: Date }
  | { ok: false; reason: "TOO_SOON" | "TOO_MANY"; retryAfterSeconds: number };

export type VerifyEmailCodeResult =
  | { ok: true }
  | { ok: false; reason: "INVALID" | "EXPIRED" | "LOCKED" | "MISSING" };

export function normaliseEmail(email: string): string {
  return String(email ?? "").trim().toLowerCase();
}

function codeSecret(): string {
  const secret = process.env.NEXTAUTH_SECRET?.trim();
  if (!secret) throw new Error("NEXTAUTH_SECRET is required to issue email codes.");
  return secret;
}

export function hashEmailCode(email: string, purpose: EmailCodePurpose, code: string): string {
  return createHmac("sha256", codeSecret())
    .update(`${purpose}:${normaliseEmail(email)}:${code}`)
    .digest("hex");
}

function sameHash(a: string, b: string): boolean {
  const left = Buffer.from(a, "hex");
  const right = Buffer.from(b, "hex");
  return left.length === right.length && timingSafeEqual(left, right);
}

function secondsUntil(target: number, now: number): number {
  return Math.max(1, Math.ceil((target - now) / 1000));
}

export async function issueEmailCode(
  input: { email: string; purpose: EmailCodePurpose },
  now = new Date(),
): Promise<IssueEmailCodeResult> {
  const email = normaliseEmail(input.email);
  const nowMs = now.getTime();

  const recent = await prisma.emailCode.findMany({
    where: { email, purpose: input.purpose, createdAt: { gte: new Date(nowMs - HOUR_MS) } },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });

  const newest = recent[0];
  if (newest && nowMs - newest.createdAt.getTime() < EMAIL_CODE_RESEND_AFTER_MS) {
    return {
      ok: false,
      reason: "TOO_SOON",
      retryAfterSeconds: secondsUntil(newest.createdAt.getTime() + EMAIL_CODE_RESEND_AFTER_MS, nowMs),
    };
  }

  if (recent.length >= EMAIL_CODE_HOURLY_LIMIT) {
    const oldest = recent[recent.length - 1];
    return {
      ok: false,
      reason: "TOO_MANY",
      retryAfterSeconds: secondsUntil(oldest.createdAt.getTime() + HOUR_MS, nowMs),
    };
  }

  const code = String(randomInt(0, 10 ** EMAIL_CODE_LENGTH)).padStart(EMAIL_CODE_LENGTH, "0");
  const expiresAt = new Date(nowMs + EMAIL_CODE_TTL_MS);

  await prisma.$transaction([
    prisma.emailCode.updateMany({
      where: { email, purpose: input.purpose, consumedAt: null },
      data: { consumedAt: now },
    }),
    prisma.emailCode.create({
      data: {
        email,
        purpose: input.purpose,
        codeHash: hashEmailCode(email, input.purpose, code),
        expiresAt,
        createdAt: now,
      },
    }),
  ]);

  return { ok: true, code, expiresAt };
}

/**
 * Check a code and spend it.
 *
 * A wrong guess counts against the code, and at the limit the code is dead:
 * the answer is to send a new one, which is throttled per address. A right
 * guess consumes the code in the same statement that checks nobody else
 * consumed it first, so two tabs submitting at once cannot both succeed.
 */
export async function verifyEmailCode(
  input: { email: string; purpose: EmailCodePurpose; code: string },
  now = new Date(),
): Promise<VerifyEmailCodeResult> {
  const email = normaliseEmail(input.email);
  const code = String(input.code ?? "").trim();

  const row = await prisma.emailCode.findFirst({
    where: { email, purpose: input.purpose, consumedAt: null },
    orderBy: { createdAt: "desc" },
    select: { id: true, codeHash: true, expiresAt: true, attempts: true },
  });

  if (!row) return { ok: false, reason: "MISSING" };
  if (row.expiresAt.getTime() <= now.getTime()) return { ok: false, reason: "EXPIRED" };
  if (row.attempts >= EMAIL_CODE_MAX_ATTEMPTS) return { ok: false, reason: "LOCKED" };

  const matches = CODE_PATTERN.test(code) && sameHash(row.codeHash, hashEmailCode(email, input.purpose, code));

  if (!matches) {
    const updated = await prisma.emailCode.update({
      where: { id: row.id },
      data: { attempts: { increment: 1 } },
      select: { attempts: true },
    });
    return { ok: false, reason: updated.attempts >= EMAIL_CODE_MAX_ATTEMPTS ? "LOCKED" : "INVALID" };
  }

  const consumed = await prisma.emailCode.updateMany({
    where: { id: row.id, consumedAt: null },
    data: { consumedAt: now },
  });

  return consumed.count === 1 ? { ok: true } : { ok: false, reason: "MISSING" };
}
