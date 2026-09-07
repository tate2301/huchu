import { describe, expect, it, vi } from "vitest";

/**
 * The manifests are data: the browser and the edge runtime import them, so
 * none of them may pull a database client into its graph. This fails the
 * moment a manifest imports something that imports Prisma.
 */
vi.mock("@corelithzw/db/client", () => {
  throw new Error("a manifest reached the database client");
});

describe("host manifests", () => {
  it("import without touching the database client", async () => {
    // The test setup has already imported the manifests once; a fresh module
    // registry makes this import evaluate them again, under the mock above.
    vi.resetModules();
    const { registeredModules } = await import("@corelithzw/platform/manifest");
    await import("@/manifests");
    expect(registeredModules().map((manifest) => manifest.id)).toContain("retail");
  });
});
