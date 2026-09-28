import { PREVIEW_HOST_PARAM, isPreviewHostOverrideEnabled } from "@/lib/platform/preview-host";

/**
 * The URL of a page on a workspace's own host.
 *
 * Three cases, matching how the proxy moves a browser between hosts
 * (`redirectAcrossHost` in `proxy.ts`):
 *
 * - No `PLATFORM_ROOT_DOMAIN`, or a loopback host (`localhost`, `*.localhost`,
 *   `127.0.0.1`): there are no tenant hosts — `lib/platform/tenant.ts` turns
 *   strict enforcement off for loopback — so the workspace is served from the
 *   origin the browser is already on.
 * - Preview override on: the tenant host has no DNS on a preview deployment,
 *   so stay on the origin and nominate the host with `?__host=`, which the
 *   proxy turns into a cookie.
 * - Otherwise: `<slug>.<root>`, keeping the scheme and port of the page the
 *   browser is on, so local development on :3000 lands on :3000.
 */
export function buildWorkspaceUrl(input: { slug: string; path: string; currentUrl: string }): URL {
  const current = new URL(input.currentUrl);
  const rootDomain = process.env.PLATFORM_ROOT_DOMAIN?.trim().toLowerCase();
  const target = new URL(input.path, current.origin);

  if (!rootDomain || isLoopbackHostname(current.hostname)) return target;

  const tenantHost = `${input.slug}.${rootDomain}`;
  if (isPreviewHostOverrideEnabled()) {
    target.searchParams.set(PREVIEW_HOST_PARAM, tenantHost);
    return target;
  }

  target.hostname = tenantHost;
  return target;
}

function isLoopbackHostname(hostname: string): boolean {
  const value = hostname.toLowerCase();
  return (
    value === "localhost" ||
    value.endsWith(".localhost") ||
    value === "127.0.0.1" ||
    value === "[::1]" ||
    value === "::1"
  );
}
