import { afterEach, describe, expect, it, vi } from "vitest";

import { buildWorkspaceUrl } from "./tenant-url";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("buildWorkspaceUrl", () => {
  it("stays on the current origin when there are no tenant hosts", () => {
    vi.stubEnv("PLATFORM_ROOT_DOMAIN", "");
    const url = buildWorkspaceUrl({ slug: "luxliquor", path: "/crm", currentUrl: "http://localhost:3000/signup/flare" });
    expect(url.toString()).toBe("http://localhost:3000/crm");
  });

  it("stays on a loopback origin, where the proxy does not enforce tenant hosts", () => {
    vi.stubEnv("PLATFORM_ROOT_DOMAIN", "apps.localtest.me");
    vi.stubEnv("PREVIEW_HOST_OVERRIDE", "");
    const url = buildWorkspaceUrl({ slug: "luxliquor", path: "/crm", currentUrl: "http://localhost:3100/signup/flare" });
    expect(url.toString()).toBe("http://localhost:3100/crm");
  });

  it("moves to the workspace's own host, keeping the scheme and port", () => {
    vi.stubEnv("PLATFORM_ROOT_DOMAIN", "apps.localtest.me");
    vi.stubEnv("PREVIEW_HOST_OVERRIDE", "");
    const url = buildWorkspaceUrl({
      slug: "luxliquor",
      path: "/signup/welcome?token=abc",
      currentUrl: "http://apps.localtest.me:3000/signup/flare/workspace",
    });
    expect(url.toString()).toBe("http://luxliquor.apps.localtest.me:3000/signup/welcome?token=abc");
  });

  it("nominates the host by parameter on a preview, where it has no DNS", () => {
    vi.stubEnv("PLATFORM_ROOT_DOMAIN", "apps.pagka.dev");
    vi.stubEnv("PREVIEW_HOST_OVERRIDE", "1");
    vi.stubEnv("VERCEL_ENV", "preview");
    const url = buildWorkspaceUrl({
      slug: "luxliquor",
      path: "/signup/welcome?token=abc",
      currentUrl: "https://huchu-git-branch.vercel.app/signup/flare/workspace",
    });
    expect(url.origin).toBe("https://huchu-git-branch.vercel.app");
    expect(url.searchParams.get("__host")).toBe("luxliquor.apps.pagka.dev");
    expect(url.searchParams.get("token")).toBe("abc");
  });
});
