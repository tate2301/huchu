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
] as const;

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_BASE_PATHS.some(
    (base) => pathname === base || pathname.startsWith(`${base}/`),
  );
}
