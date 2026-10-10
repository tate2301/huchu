/**
 * Pages anybody can open without signing in.
 *
 * The token in the URL is the capability: these are shared over WhatsApp and
 * email, so they bypass tenant, host and auth gating entirely.
 *
 * Two things have to agree about this list — the proxy, which decides whether
 * to demand a session, and the app shell, which decides whether to draw the
 * sidebar and navbar. They had their own copies, and only the proxy's was kept
 * up to date, so a customer opening a quote link got the whole authenticated
 * chrome wrapped around it: a sidebar full of links they cannot follow, a
 * search box for records they cannot see, and someone else's workspace name.
 * One list, imported by both.
 */
export const PUBLIC_BASE_PATHS = [
  /** Intake form — /f/[token] */
  "/f",
  /** Document approval — /a/[token] */
  "/a",
  /** Site visit brief for whoever is going — /v/[token] */
  "/v",
  /** Client sign-off and feedback — /s/[token] */
  "/s",
  /** Portal account claim for students and guardians — /c/[token] */
  "/c",
  /**
   * Self-serve signup — /signup/[product], and /signup/welcome where the new
   * admin lands on their workspace host holding a one-use ticket. A stranger
   * has no session and no tenant yet, which is the point.
   */
  "/signup",
  /**
   * Joining a shop by the WhatsApp link a new person is sent — /join/[token]
   * (80-admin 5.6). They have no password yet, or never will (till only).
   */
  "/join",
] as const;

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_BASE_PATHS.some(
    (base) => pathname === base || pathname.startsWith(`${base}/`),
  );
}
