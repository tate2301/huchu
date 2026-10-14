import { Secret, TOTP } from "otpauth";

/**
 * The authenticator code: RFC 6238, six digits, thirty seconds, SHA-1 — the
 * defaults every authenticator app reads from a QR code without asking.
 */

const ISSUER = "Corelith admin";
const PERIOD = 30;

function totp(secret: string, label = "operator") {
  return new TOTP({
    issuer: ISSUER,
    label,
    algorithm: "SHA1",
    digits: 6,
    period: PERIOD,
    secret: Secret.fromBase32(secret),
  });
}

/** A new secret, base32, 160 bits. */
export function newAuthenticatorSecret(): string {
  return new Secret({ size: 20 }).base32;
}

/** What the QR code holds: `otpauth://totp/Corelith%20admin:<email>?secret=…`. */
export function authenticatorUri(secret: string, email: string): string {
  return totp(secret, email).toString();
}

/** The secret in groups of four, for typing it in by hand. */
export function formatSecretForTyping(secret: string): string {
  return secret.replace(/(.{4})/g, "$1 ").trim();
}

/**
 * The step a code is good for, or null.
 *
 * One step either side is accepted, because a phone's clock drifts. A code
 * whose step is not after `lastStep` is refused even when it is right: each
 * code signs in once.
 */
export function acceptedStep(
  secret: string,
  code: string,
  lastStep: number | null,
  now = Date.now(),
): number | null {
  const token = code.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(token)) return null;
  const delta = totp(secret).validate({ token, timestamp: now, window: 1 });
  if (delta === null) return null;
  const step = TOTP.counter({ period: PERIOD, timestamp: now }) + delta;
  if (lastStep !== null && step <= lastStep) return null;
  return step;
}

/** The code for a moment, for tests and the operator CLI. */
export function codeAt(secret: string, now = Date.now()): string {
  return totp(secret).generate({ timestamp: now });
}
