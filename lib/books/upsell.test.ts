import { describe, expect, it } from "vitest";

import { sinceWords, upsellView } from "./upsell";

const NOW = new Date("2026-10-20T08:00:00.000Z");

describe("the Books upsell's finding (BkUpsell)", () => {
  it("counts the entries since the first one, as the board says it", () => {
    expect(upsellView({ entries: 1204, since: "2026-03-01", waiting: 0 }, "SUPERADMIN", NOW)).toEqual({
      finding: { fact: "Your books hold 1,204 entries since 1 March.", rest: "Every sale, payment and pay run has posted." },
      canAdd: true,
    });
  });

  it("says what is still waiting to post rather than claiming everything has", () => {
    expect(upsellView({ entries: 1, since: "2026-10-02", waiting: 3 }, "MANAGER", NOW)).toEqual({
      finding: { fact: "Your books hold 1 entry since 2 October.", rest: "3 are still waiting to post." },
      canAdd: false,
    });
  });

  it("reads as ready in a workspace that has posted nothing yet", () => {
    expect(upsellView({ entries: 0, since: null, waiting: 0 }, "SUPERADMIN", NOW).finding).toEqual({
      fact: "Your books are ready.",
      rest: "Every sale, payment and pay run posts here.",
    });
  });

  it("names the year of a first entry from another year", () => {
    expect(sinceWords("2025-11-14", NOW)).toBe("14 November 2025");
  });
});
