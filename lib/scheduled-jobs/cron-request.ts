import { timingSafeEqual } from "node:crypto";

/**
 * Whether a request to the tick comes from the scheduler: it carries
 * `Authorization: Bearer <CRON_SECRET>`, the header Vercel Cron also sends.
 * No secret configured means nobody may call it.
 */
export function isCronRequest(authorization: string | null, secret = process.env.CRON_SECRET): boolean {
  if (!secret) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(authorization ?? "");
  return given.length === expected.length && timingSafeEqual(given, expected);
}
