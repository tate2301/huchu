// Any origin works for resolving: the check is only that a path cannot leave it.
const RESOLVE_ORIGIN = "http://callback.invalid";

/**
 * A same-site path to go to after sign-in, or `fallbackPath`.
 *
 * Browsers read `\` as `/` and drop tabs and newlines, so `/\evil.com` or
 * `/\t/evil.com` would leave the site even though they start with one `/`.
 * The path is resolved the way a browser would and refused unless it stays on
 * the same origin; what comes back is the resolved path, never the raw input.
 */
export function normalizeCallbackUrl(callbackUrl: string | null | undefined, fallbackPath: string): string {
  if (!callbackUrl) {
    return fallbackPath;
  }

  const raw = callbackUrl.trim();
  if (!raw.startsWith("/") || /[\\\u0000-\u001f\u007f]/.test(raw)) {
    return fallbackPath;
  }

  let resolved: URL;
  try {
    resolved = new URL(raw, RESOLVE_ORIGIN);
  } catch {
    return fallbackPath;
  }
  if (resolved.origin !== RESOLVE_ORIGIN) {
    return fallbackPath;
  }

  return `${resolved.pathname}${resolved.search}${resolved.hash}`;
}

export function buildCallbackLoginPath(loginPath: string, callbackUrl: string | null | undefined): string {
  const normalizedCallbackUrl = normalizeCallbackUrl(callbackUrl, "");
  if (!normalizedCallbackUrl) {
    return loginPath;
  }

  return `${loginPath}?callbackUrl=${encodeURIComponent(normalizedCallbackUrl)}`;
}
