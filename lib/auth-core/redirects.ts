export function normalizeCallbackUrl(callbackUrl: string | null | undefined, fallbackPath: string): string {
  if (!callbackUrl) {
    return fallbackPath;
  }

  const normalized = callbackUrl.trim();
  if (!normalized.startsWith("/") || normalized.startsWith("//")) {
    return fallbackPath;
  }

  return normalized;
}

export function buildCallbackLoginPath(loginPath: string, callbackUrl: string | null | undefined): string {
  const normalizedCallbackUrl = normalizeCallbackUrl(callbackUrl, "");
  if (!normalizedCallbackUrl) {
    return loginPath;
  }

  return `${loginPath}?callbackUrl=${encodeURIComponent(normalizedCallbackUrl)}`;
}
