/**
 * Host override for preview and staging deployments.
 *
 * Tenancy is decided by the Host header. `floorcode.<root>` is the floorcode
 * workspace, `pos.floorcode.<root>` is its till, `<root>` is the marketing
 * site, and anything else is nothing at all. That works in production, where
 * the DNS is ours and every tenant has a name under it.
 *
 * It does not work on a Vercel preview. A preview answers on one generated
 * `huchu-git-<branch>-<team>.vercel.app` name that matches no tenant and no
 * root domain, so `getPlatformHostContext` reports no tenant slug while strict
 * enforcement is still on: the credentials provider refuses the sign-in with
 * TENANT_NOT_FOUND and every authenticated page redirects to /access-blocked.
 * Turning `PLATFORM_ROOT_DOMAIN` off makes the deployment reachable but takes
 * tenant routing out of the build being tested, which is usually the thing you
 * wanted to look at.
 *
 * So a preview may nominate the host it should be treated as. The override is
 * read in exactly one place — `getHostHeaderFromRequestHeaders`, the single
 * question the rest of the app asks about which host it is on — so the proxy,
 * the credentials provider, the app shell and the portal layouts all agree
 * about the answer without any of them knowing this module exists.
 *
 * It is off unless `PREVIEW_HOST_OVERRIDE` is set, and it refuses to switch on
 * when `VERCEL_ENV` says production.
 */

/** Cookie holding the nominated host. Set by the proxy, read on every request. */
export const PREVIEW_HOST_COOKIE = "__huchu_preview_host";
/** Header form of the same thing, for curl and for the e2e suite. */
export const PREVIEW_HOST_HEADER = "x-huchu-preview-host";
/** `?__host=pos.floorcode.example.com` — a whole host, portal prefix included. */
export const PREVIEW_HOST_PARAM = "__host";
/** `?__tenant=floorcode` — a slug, expanded against PLATFORM_ROOT_DOMAIN. */
export const PREVIEW_TENANT_PARAM = "__tenant";
/** Where the control page lives. Public: it is how you reach a locked-out preview. */
export const PREVIEW_HOST_PATH = "/preview-host";

// A hostname, optionally with a port. Deliberately strict — this value is
// handed to the tenant resolver and compared against the allowed-host list, so
// it should look like a host and nothing else.
const HOST_PATTERN = /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?(?::\d{1,5})?$/;

function isEnvFlagSet(value: string | undefined): boolean {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

/**
 * The override is opt-in per environment, and never available on a production
 * Vercel deployment even if the flag leaks into the production env group —
 * nominating your own Host header is exactly the thing tenant enforcement
 * exists to prevent.
 */
export function isPreviewHostOverrideEnabled(): boolean {
  if (process.env.VERCEL_ENV?.trim().toLowerCase() === "production") {
    return false;
  }
  return isEnvFlagSet(process.env.PREVIEW_HOST_OVERRIDE);
}

/**
 * The escape hatch proper: stop checking the request host against the tenant's
 * allowed-host list, and stop redirecting across hosts.
 *
 * The override above makes a preview behave as though it were on the tenant
 * host. This makes a preview reachable even when it is not — a stale
 * `allowedHosts` claim in a session token minted before the override was set,
 * a tenant whose subdomain has not been provisioned, a branch deploy someone
 * opened without knowing about any of this. Without it those cases dead-end on
 * /access-blocked with no way back, because the page that would let you fix it
 * is behind the same check.
 */
export function isHostEnforcementBypassed(): boolean {
  if (process.env.VERCEL_ENV?.trim().toLowerCase() === "production") {
    return false;
  }
  return isEnvFlagSet(process.env.PREVIEW_BYPASS_HOST_ENFORCEMENT);
}

function normalizeHost(value: string | null | undefined): string {
  if (!value) {
    return "";
  }
  return value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/\.$/, "");
}

/**
 * Suffix allowlist, if you want one. `PREVIEW_HOST_ALLOWLIST` is a comma-
 * separated list of host suffixes the override may name; unset means any host
 * is allowed, which is the sensible default for a preview environment that is
 * already behind Vercel's deployment protection.
 */
function getAllowedSuffixes(): string[] {
  return (process.env.PREVIEW_HOST_ALLOWLIST ?? "")
    .split(",")
    .map((entry) => normalizeHost(entry))
    .filter(Boolean);
}

function isAllowedOverrideHost(host: string): boolean {
  const suffixes = getAllowedSuffixes();
  if (suffixes.length === 0) {
    return true;
  }
  return suffixes.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
}

/**
 * Validate a nominated host. Returns null for anything that is not a plausible
 * hostname, so a malformed cookie falls back to the real host rather than
 * poisoning tenant resolution.
 */
export function normalizePreviewHost(value: string | null | undefined): string | null {
  const host = normalizeHost(value);
  if (!host || host.length > 253) {
    return null;
  }
  if (!HOST_PATTERN.test(host)) {
    return null;
  }
  if (!isAllowedOverrideHost(host)) {
    return null;
  }
  return host;
}

/** Expand a tenant slug into a host under the configured root domain. */
export function previewHostForTenantSlug(slug: string | null | undefined): string | null {
  const normalizedSlug = slug?.trim().toLowerCase() ?? "";
  if (!normalizedSlug || !/^[a-z0-9-]+$/.test(normalizedSlug)) {
    return null;
  }

  const rootDomain = normalizeHost(process.env.PLATFORM_ROOT_DOMAIN);
  if (!rootDomain) {
    return null;
  }

  return normalizePreviewHost(`${normalizedSlug}.${rootDomain}`);
}

function readCookie(cookieHeader: string | null | undefined, name: string): string | null {
  if (!cookieHeader) {
    return null;
  }

  for (const part of cookieHeader.split(";")) {
    const separatorIndex = part.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }
    if (part.slice(0, separatorIndex).trim() !== name) {
      continue;
    }
    const rawValue = part.slice(separatorIndex + 1).trim();
    try {
      return decodeURIComponent(rawValue);
    } catch {
      return rawValue;
    }
  }

  return null;
}

/**
 * The nominated host for this request, or null to use the real one.
 *
 * Takes the two already-extracted header values rather than a headers object,
 * so `lib/platform/tenant.ts` can call this without this module having to
 * import anything back from it.
 */
export function resolvePreviewHostOverride(
  overrideHeaderValue: string | null | undefined,
  cookieHeaderValue: string | null | undefined,
): string | null {
  if (!isPreviewHostOverrideEnabled()) {
    return null;
  }

  // Header wins over cookie: a curl or an e2e run should not have to unset
  // whatever a browser session left behind.
  return (
    normalizePreviewHost(overrideHeaderValue) ??
    normalizePreviewHost(readCookie(cookieHeaderValue, PREVIEW_HOST_COOKIE))
  );
}

export type PreviewHostIntent =
  /** No override parameter in the URL. */
  | { kind: "absent" }
  /** `?__host=` or `?__tenant=` with an empty value — go back to the real host. */
  | { kind: "clear" }
  /** A host to adopt. */
  | { kind: "set"; host: string }
  /** A parameter was present but unusable. */
  | { kind: "invalid"; value: string };

/**
 * Read a host nomination out of a request URL.
 *
 * This is how you switch tenants from the address bar:
 * `…vercel.app/login?__tenant=floorcode`. The proxy turns it into a cookie and
 * redirects to the clean URL, so the parameter never survives into the page
 * and never ends up in a shared link or a callbackUrl.
 */
export function readPreviewHostIntentFromUrl(url: URL): PreviewHostIntent {
  if (!isPreviewHostOverrideEnabled()) {
    return { kind: "absent" };
  }

  const hostParam = url.searchParams.get(PREVIEW_HOST_PARAM);
  if (hostParam !== null) {
    if (!hostParam.trim()) {
      return { kind: "clear" };
    }
    const host = normalizePreviewHost(hostParam);
    return host ? { kind: "set", host } : { kind: "invalid", value: hostParam };
  }

  const tenantParam = url.searchParams.get(PREVIEW_TENANT_PARAM);
  if (tenantParam !== null) {
    if (!tenantParam.trim()) {
      return { kind: "clear" };
    }
    const host = previewHostForTenantSlug(tenantParam);
    return host ? { kind: "set", host } : { kind: "invalid", value: tenantParam };
  }

  return { kind: "absent" };
}

/** True when the URL carries either parameter, whether or not it was usable. */
export function urlCarriesPreviewHostParam(url: URL): boolean {
  return (
    url.searchParams.has(PREVIEW_HOST_PARAM) || url.searchParams.has(PREVIEW_TENANT_PARAM)
  );
}

/** Strip both parameters, so the redirect that sets the cookie lands on a clean URL. */
export function stripPreviewHostParams(url: URL): void {
  url.searchParams.delete(PREVIEW_HOST_PARAM);
  url.searchParams.delete(PREVIEW_TENANT_PARAM);
}
