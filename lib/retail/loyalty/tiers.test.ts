import { describe, expect, it } from "vitest";

import { isTopTier, parseTier, sortTiers, tierFor, tierTag } from "./tiers";

const tiers = [
  { name: "Gold", from: "1500.00" },
  { name: "Bronze", from: "0.00" },
  { name: "Silver", from: "500.00" },
];

describe("loyalty tiers", () => {
  it("reads a tier as the board writes it, and writes it back", () => {
    expect(parseTier("Silver, from US$500")).toEqual({ name: "Silver", from: "500.00" });
    expect(parseTier("Gold, from US$1,500")).toEqual({ name: "Gold", from: "1500.00" });
    expect(parseTier("Platinum, from US$5,000.50")).toEqual({ name: "Platinum", from: "5000.50" });
    expect(parseTier("Silver 500")).toBeNull();
    expect(parseTier("Silver, from 500")).toBeNull();
    expect(tierTag({ name: "Gold", from: "1500.00" })).toBe("Gold, from US$1,500");
    expect(tierTag({ name: "Bronze", from: "0.00" })).toBe("Bronze, from US$0");
  });

  it("orders tiers lowest first, and the last is the top tier", () => {
    expect(sortTiers(tiers).map((tier) => tier.name)).toEqual(["Bronze", "Silver", "Gold"]);
    expect(isTopTier("Gold", tiers)).toBe(true);
    expect(isTopTier("Silver", tiers)).toBe(false);
    expect(isTopTier(null, tiers)).toBe(false);
  });

  it("gives the highest tier the spend in 12 months has reached", () => {
    const settings = { tiers };
    expect(tierFor({ spend12m: 0, settings, held: null, today: "2026-10-12" })).toBe("Bronze");
    expect(tierFor({ spend12m: "499.99", settings, held: null, today: "2026-10-12" })).toBe("Bronze");
    expect(tierFor({ spend12m: "500.00", settings, held: null, today: "2026-10-12" })).toBe("Silver");
    expect(tierFor({ spend12m: 2000, settings, held: null, today: "2026-10-12" })).toBe("Gold");
  });

  it("keeps a held tier until its day passes", () => {
    const settings = { tiers };
    expect(tierFor({ spend12m: 10, settings, held: { name: "Gold", until: "2026-12-31" }, today: "2026-10-12" })).toBe("Gold");
    expect(tierFor({ spend12m: 10, settings, held: { name: "Gold", until: "2026-10-12" }, today: "2026-10-12" })).toBe("Gold");
    expect(tierFor({ spend12m: 10, settings, held: { name: "Gold", until: "2026-10-11" }, today: "2026-10-12" })).toBe("Bronze");
  });

  it("drops a held tier whose name the shop removed", () => {
    const settings = { tiers: tiers.filter((tier) => tier.name !== "Gold") };
    expect(tierFor({ spend12m: 600, settings, held: { name: "Gold", until: "2026-12-31" }, today: "2026-10-12" })).toBe("Silver");
  });
});
