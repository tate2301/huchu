import { describe, expect, it } from "vitest";

import { buildCallbackLoginPath, normalizeCallbackUrl } from "./redirects";

describe("normalizeCallbackUrl", () => {
  it("keeps a same-site path with its query and hash", () => {
    expect(normalizeCallbackUrl("/retail/pos?tab=open#top", "/")).toBe("/retail/pos?tab=open#top");
  });

  it("falls back when there is no path", () => {
    expect(normalizeCallbackUrl(null, "/home")).toBe("/home");
    expect(normalizeCallbackUrl("", "/home")).toBe("/home");
  });

  it.each([
    ["absolute URL", "https://evil.com/x"],
    ["protocol-relative", "//evil.com/x"],
    ["backslash after the slash", "/\\evil.com/x"],
    ["backslash later", "/a/..\\..\\\\evil.com"],
    ["tab inside", "/\t/evil.com"],
    ["newline inside", "/\n/evil.com"],
    ["relative path", "evil.com"],
    ["javascript scheme", "javascript:alert(1)"],
    ["dot-dot to protocol-relative", "/..//evil.com"],
    ["dot to protocol-relative", "/.//evil.com/x"],
    ["segment then dot-dot to protocol-relative", "/a/..//evil.com"],
    ["encoded dot-dot to protocol-relative", "/%2e%2e//evil.com"],
    ["encoded dot to protocol-relative", "/%2E//evil.com"],
  ])("refuses a path that leaves the site (%s)", (_label, input) => {
    expect(normalizeCallbackUrl(input, "/")).toBe("/");
  });

  it("refuses '/\\evil.com' as decoded from ?callbackUrl=%2F%5Cevil.com", () => {
    const decoded = new URLSearchParams("callbackUrl=%2F%5Cevil.com").get("callbackUrl");
    expect(decoded).toBe("/\\evil.com");
    expect(normalizeCallbackUrl(decoded, "/")).toBe("/");
  });

  it("keeps '/%5Cevil.com' on the site: an encoded backslash stays a path segment", () => {
    const result = normalizeCallbackUrl("/%5Cevil.com", "/");
    expect(result).toBe("/%5Cevil.com");
    expect(new URL(result, "https://shop.example").origin).toBe("https://shop.example");
  });

  it("refuses '/..//example.org/x' as decoded from ?callbackUrl=%2F..%2F%2Fexample.org%2Fx", () => {
    const decoded = new URLSearchParams("callbackUrl=%2F..%2F%2Fexample.org%2Fx").get("callbackUrl");
    expect(normalizeCallbackUrl(decoded, "/")).toBe("/");
  });

  it("keeps a path whose dot segments resolve inside the site", () => {
    expect(normalizeCallbackUrl("/retail/../retail/pos", "/")).toBe("/retail/pos");
  });
});

describe("buildCallbackLoginPath", () => {
  it("drops a callback that would leave the site", () => {
    expect(buildCallbackLoginPath("/login", "/\\evil.com")).toBe("/login");
    expect(buildCallbackLoginPath("/login", "/..//evil.com")).toBe("/login");
    expect(buildCallbackLoginPath("/login", "/shift")).toBe("/login?callbackUrl=%2Fshift");
  });
});
