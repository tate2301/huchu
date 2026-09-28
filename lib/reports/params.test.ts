import { describe, expect, it } from "vitest";

import { dateRange, periodParams, resolveParams } from "./params";

const NOW = new Date("2026-09-28T10:00:00Z");

describe("resolveParams", () => {
  const declared = [
    ...periodParams(7),
    { key: "site", label: "Site", type: "choice" as const, options: [{ value: "all", label: "All" }, { value: "s1", label: "Main" }] },
  ];

  it("fills a window ending today when nothing was asked for", () => {
    expect(resolveParams(declared, {}, NOW)).toEqual({ from: "2026-09-21", to: "2026-09-28" });
  });

  it("keeps an emptied date open-ended, and says so, so it survives a round trip", () => {
    const once = resolveParams(declared, { from: "" }, NOW);
    expect(once).toEqual({ from: "", to: "2026-09-28" });
    expect(resolveParams(declared, once, NOW)).toEqual(once);
    expect(dateRange(once)).toEqual({ lte: new Date("2026-09-28T23:59:59.999Z") });
  });

  it("refuses what the report does not declare or offer", () => {
    expect(resolveParams(declared, { site: "elsewhere", extra: "x", from: "yesterday" }, NOW)).toEqual({
      from: "2026-09-21",
      to: "2026-09-28",
    });
    expect(resolveParams(declared, { site: "s1" }, NOW).site).toBe("s1");
  });

  it("reads month and year starts", () => {
    expect(
      resolveParams(
        [
          { key: "from", label: "From", type: "date", default: "yearStart" },
          { key: "to", label: "To", type: "date", default: "monthStart" },
        ],
        {},
        NOW,
      ),
    ).toEqual({ from: "2026-01-01", to: "2026-09-01" });
  });
});
