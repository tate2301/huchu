import { describe, expect, it } from "vitest";

import { sinceWords, upsellView } from "./upsell";

describe("the Books upsell's finding (bk-x-noscreens)", () => {
  it("counts the entries since the first one, as the board says it", () => {
    expect(upsellView({ entries: 1204, since: "2026-03-01", waiting: 0 }, "SUPERADMIN")).toEqual({
      finding: { fact: "Your books hold 1,204 entries since 1 Mar 2026.", rest: "Every sale, payment and pay run has posted from the first day." },
      canAdd: true,
    });
  });

  it("says what is still waiting to post rather than claiming everything has", () => {
    expect(upsellView({ entries: 1, since: "2026-10-02", waiting: 3 }, "MANAGER")).toEqual({
      finding: { fact: "Your books hold 1 entry since 2 Oct 2026.", rest: "3 are still waiting to post." },
      canAdd: false,
    });
  });

  it("reads as ready in a workspace that has posted nothing yet", () => {
    expect(upsellView({ entries: 0, since: null, waiting: 0 }, "SUPERADMIN").finding).toEqual({
      fact: "Your books are ready.",
      rest: "Every sale, payment and pay run posts here.",
    });
  });

  it("writes the first day with its year, as bk-x-noscreens does", () => {
    expect(sinceWords("2025-11-14")).toBe("14 Nov 2025");
  });
});
