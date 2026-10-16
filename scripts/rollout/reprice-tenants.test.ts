import { describe, expect, it } from "vitest";

import { planReprice } from "@/scripts/rollout/reprice-tenants";

describe("repricing every workspace on the vertical rule", () => {
  it("names only the workspaces whose stored price is wrong", () => {
    expect(
      planReprice([
        { companyId: "a", slug: "kwik", stored: 39, verticals: ["RETAIL"], members: 3 },
        { companyId: "b", slug: "mine", stored: 249, verticals: ["GOLD", "GENERAL"], members: 12 },
        { companyId: "c", slug: "new", stored: null, verticals: ["CRM"], members: 6 },
      ]),
    ).toEqual([
      { companyId: "b", slug: "mine", from: 249, to: 198 },
      { companyId: "c", slug: "new", from: null, to: 99 },
    ]);
  });

  it("prices a workspace with no verticals at nothing", () => {
    expect(planReprice([{ companyId: "d", slug: "empty", stored: 39, verticals: [], members: 2 }])).toEqual([
      { companyId: "d", slug: "empty", from: 39, to: 0 },
    ]);
  });
});
