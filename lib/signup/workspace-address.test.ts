import { describe, expect, it } from "vitest";

import { slugifyTenant } from "@/lib/platform/tenant-slug";
import {
  WORKSPACE_SLUG_MAX_LENGTH,
  checkWorkspaceSlug,
  describeWorkspaceSlugProblem,
  suggestWorkspaceSlug,
} from "./workspace-address";

describe("workspace address", () => {
  it("suggests the address provisioning would derive from the name", () => {
    expect(suggestWorkspaceSlug("Lux Liquor (Pvt) Ltd")).toBe("lux-liquor-pvt-ltd");
    expect(suggestWorkspaceSlug("Lux Liquor")).toBe(slugifyTenant("Lux Liquor"));
  });

  it("cuts a long name to the longest address allowed, without a trailing hyphen", () => {
    const suggestion = suggestWorkspaceSlug("Chitungwiza Medical Centre and Pharmacy Holdings Private Limited");
    expect(suggestion.length).toBeLessThanOrEqual(WORKSPACE_SLUG_MAX_LENGTH);
    expect(suggestion.endsWith("-")).toBe(false);
    expect(checkWorkspaceSlug(suggestion)).toBeNull();
  });

  it("accepts an ordinary address", () => {
    expect(checkWorkspaceSlug("luxliquor")).toBeNull();
    expect(checkWorkspaceSlug("lux-liquor-2")).toBeNull();
  });

  it("names the problem with an address it refuses", () => {
    expect(checkWorkspaceSlug("lx")).toBe("TOO_SHORT");
    expect(checkWorkspaceSlug("a".repeat(WORKSPACE_SLUG_MAX_LENGTH + 1))).toBe("TOO_LONG");
    expect(checkWorkspaceSlug("Lux Liquor")).toBe("NOT_AN_ADDRESS");
    expect(checkWorkspaceSlug("lux--liquor")).toBe("NOT_AN_ADDRESS");
    expect(checkWorkspaceSlug("-lux")).toBe("NOT_AN_ADDRESS");
  });

  it("keeps the platform's own hosts and the portal prefixes for the platform", () => {
    for (const slug of ["app", "www", "admin", "api", "pos", "staff", "parents", "students", "guardian"]) {
      expect(checkWorkspaceSlug(slug)).toBe("RESERVED");
    }
  });

  it("says every problem in words", () => {
    for (const problem of ["TOO_SHORT", "TOO_LONG", "NOT_AN_ADDRESS", "RESERVED"] as const) {
      expect(describeWorkspaceSlugProblem(problem).length).toBeGreaterThan(0);
    }
  });
});
