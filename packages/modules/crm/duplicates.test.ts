import { describe, expect, it } from "vitest";

import { extractDomain, nameSimilarity, normalizeName } from "./duplicates";

describe("normalizeName", () => {
  it("strips company suffixes and punctuation", () => {
    expect(normalizeName("Delta Interiors (Pvt) Ltd")).toBe("delta interiors");
    expect(normalizeName("DELTA  INTERIORS")).toBe("delta interiors");
  });

  it("returns an empty string for nothing", () => {
    expect(normalizeName(null)).toBe("");
    expect(normalizeName("   ")).toBe("");
  });
});

describe("extractDomain", () => {
  it("takes the host from a full URL", () => {
    expect(extractDomain("https://www.delta.co.zw/about")).toBe("delta.co.zw");
  });

  it("accepts a bare domain", () => {
    expect(extractDomain("delta.co.zw")).toBe("delta.co.zw");
  });

  it("returns null for nothing usable", () => {
    expect(extractDomain(null)).toBeNull();
    expect(extractDomain("   ")).toBeNull();
  });
});

describe("nameSimilarity", () => {
  it("scores the same name as identical once suffixes are stripped", () => {
    expect(nameSimilarity("Delta Interiors Ltd", "Delta Interiors (Pvt)")).toBe(1);
  });

  it("scores an unrelated name at zero", () => {
    expect(nameSimilarity("Delta Interiors", "Zimbabwe Roofing")).toBe(0);
  });

  it("is order-insensitive, so a reversed personal name still matches", () => {
    expect(nameSimilarity("John Moyo", "Moyo John")).toBe(1);
  });

  it("scores a partial overlap between zero and one", () => {
    const score = nameSimilarity("Delta Interiors Harare", "Delta Interiors");
    expect(score).toBeGreaterThan(0.6);
    expect(score).toBeLessThan(1);
  });

  it("returns zero when either side is empty", () => {
    expect(nameSimilarity("", "Delta")).toBe(0);
    // A name made only of stripped suffixes has no tokens left to compare.
    expect(nameSimilarity("Ltd", "Delta")).toBe(0);
  });
});
