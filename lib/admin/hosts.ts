import { AdminRefusal } from "@/lib/admin/refusal";
import { PREVIEW_HOST_PARAM, isPreviewHostOverrideEnabled } from "@/lib/platform/preview-host";

/** Where a workspace lives: `<slug>.<root>`. Null where no root is configured (a bare local setup). */
export function getPlatformRootDomain(): string | null {
  return process.env.PLATFORM_ROOT_DOMAIN?.trim().toLowerCase() || null;
}

/**
 * A page on a workspace's own host, opened from the admin host.
 *
 * Unlike `buildWorkspaceUrl`, never the origin the browser is on: that origin
 * is the admin host, which serves no workspace. Keeps the scheme and port, so
 * local development on :3000 lands on :3000; on a preview deployment, where
 * the workspace host has no DNS, it nominates the host with `?__host=`.
 */
export function workspaceUrl(slug: string, path: string, currentOrigin: string): URL {
  const root = getPlatformRootDomain();
  if (!root) throw new AdminRefusal("This deployment has no PLATFORM_ROOT_DOMAIN, so a workspace has no address to open.");
  const target = new URL(path, currentOrigin);
  const host = `${slug}.${root}`;
  if (isPreviewHostOverrideEnabled()) target.searchParams.set(PREVIEW_HOST_PARAM, host);
  else target.hostname = host;
  return target;
}
