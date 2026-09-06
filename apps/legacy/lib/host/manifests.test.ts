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
    const { registeredModules } = await import("@corelithzw/platform/manifest");
    await import("@/manifests");
    expect(registeredModules().map((manifest) => manifest.id)).toContain("crm");
  });
});
