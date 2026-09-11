/**
 * `X-Hub-Signature-256` — the only thing that makes a delivery trustworthy.
 *
 * The callback URL is public and its token is in a Meta dashboard field, so
 * possession of the URL proves nothing. What proves a delivery came from Meta
 * is an HMAC-SHA256 of the exact bytes delivered, keyed by the app secret.
 *
 * "Exact bytes" is the whole trap: `await request.json()` and re-serialising
 * changes them, and the signature then fails for every real delivery while
 * still passing for nothing. The route reads `text()` and hands it here.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export const SIGNATURE_HEADER = "x-hub-signature-256";

export type SignatureCheck =
  | { ok: true }
  | { ok: false; reason: "MISSING" | "MALFORMED" | "MISMATCH" };

export function signPayload(rawBody: string, appSecret: string): string {
  return `sha256=${createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex")}`;
}

export function verifySignature(
  rawBody: string,
  header: string | null | undefined,
  appSecret: string,
): SignatureCheck {
  if (!header) return { ok: false, reason: "MISSING" };

  const trimmed = header.trim();
  if (!trimmed.startsWith("sha256=")) return { ok: false, reason: "MALFORMED" };

  const provided = Buffer.from(trimmed, "utf8");
  const expected = Buffer.from(signPayload(rawBody, appSecret), "utf8");

  // timingSafeEqual throws on a length mismatch rather than returning false,
  // and a wrong-length signature is a mismatch, not a crash.
  if (provided.length !== expected.length) return { ok: false, reason: "MISMATCH" };
  return timingSafeEqual(provided, expected) ? { ok: true } : { ok: false, reason: "MISMATCH" };
}

/**
 * The GET handshake's verify token, compared without leaking its length by
 * timing. Meta sends this once when the callback URL is saved, and again on
 * every re-verification from the dashboard.
 */
export function verifyTokenMatches(
  provided: string | null | undefined,
  expected: string,
): boolean {
  if (!provided) return false;
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
