/**
 * The caller's address as our own edge saw it, for throttles a client must not
 * be able to step around.
 *
 * On Vercel the edge overwrites `x-real-ip` and `x-forwarded-for` with the
 * connecting address, so `x-real-ip` is the client's and nobody else's.
 * Anywhere else a proxy in front of the app appends the address it saw to
 * `x-forwarded-for`, so the trusted value is the last entry: whatever a client
 * sends itself sits to the left of it. The first entry, which most code reads,
 * is the one a client chooses.
 */
export function trustedClientAddress(headers: Headers, onVercel: boolean = Boolean(process.env.VERCEL)): string {
  if (onVercel) {
    const realIp = headers.get("x-real-ip")?.trim();
    if (realIp) return realIp;
  }
  const forwarded = headers
    .get("x-forwarded-for")
    ?.split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  return forwarded?.at(-1) || headers.get("x-real-ip")?.trim() || "unknown";
}
