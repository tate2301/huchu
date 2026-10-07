import { describe, expect, it } from "vitest";

import { takingsOverTime } from "./shift-record";
import { salesWords, takingsTitle } from "./shift-words";

const at = (iso: string) => new Date(iso);

describe("a shift's rows in words", () => {
  it("counts sales, refunds and voids apart, so the KPI and the Σ agree", () => {
    expect(salesWords({ saleCount: 4, refundCount: 0, voidCount: 0 })).toBe("4 sales");
    expect(salesWords({ saleCount: 1, refundCount: 0, voidCount: 0 })).toBe("1 sale");
    expect(salesWords({ saleCount: 17, refundCount: 1, voidCount: 0 })).toBe("17 sales, 1 refund");
    expect(salesWords({ saleCount: 17, refundCount: 2, voidCount: 2 })).toBe("17 sales, 2 refunds, 2 voided");
  });

  it("names the chart by the hours a bar covers", () => {
    expect(takingsTitle(1)).toBe("Takings per hour");
    expect(takingsTitle(3)).toBe("Takings per 3 hours");
    expect(takingsTitle(24)).toBe("Takings per day");
  });
});

describe("takings over the time a drawer was open", () => {
  it("draws a bar an hour within a day, labelled by the hour in Harare", () => {
    const view = takingsOverTime(at("2026-10-03T05:58:00Z"), at("2026-10-03T11:12:00Z"), [
      { at: at("2026-10-03T07:16:00Z"), amount: 8.5 },
      { at: at("2026-10-03T09:40:00Z"), amount: 14 },
      { at: at("2026-10-03T09:50:00Z"), amount: -2 },
    ]);
    expect(view.hoursEach).toBe(1);
    expect(view.bars.map((bar) => bar.label)).toEqual(["07:00", "08:00", "09:00", "10:00", "11:00", "12:00", "13:00"]);
    expect(view.bars.map((bar) => bar.tick)).toEqual(["07:00", "08:00", "09:00", "10:00", "11:00", "12:00", "13:00"]);
    expect(view.bars.map((bar) => bar.amount)).toEqual([0, 0, 8.5, 0, 12, 0, 0]);
  });

  it("buckets a drawer left open for days into at most 24 bars that name the day", () => {
    // Open 52 hours, from 3 October 08:00 in Harare.
    const view = takingsOverTime(at("2026-10-03T06:10:00Z"), at("2026-10-05T10:10:00Z"), [
      { at: at("2026-10-03T06:30:00Z"), amount: 80.95 },
      { at: at("2026-10-05T10:00:00Z"), amount: 39.6 },
    ]);
    expect(view.hoursEach).toBe(3);
    expect(view.bars).toHaveLength(18);
    expect(view.bars[0]).toEqual({ label: "3 Oct 08:00–11:00", tick: "3 Oct 08:00", amount: 80.95 });
    expect(view.bars[17]!.amount).toBe(39.6);
    // Six labels at most along the axis.
    expect(view.bars.filter((bar) => bar.tick).map((bar) => bar.tick)).toEqual([
      "3 Oct 08:00",
      "3 Oct 17:00",
      "4 Oct 02:00",
      "4 Oct 11:00",
      "4 Oct 20:00",
      "5 Oct 05:00",
    ]);
    expect(view.bars.reduce((sum, bar) => sum + bar.amount, 0)).toBeCloseTo(120.55);
  });

  it("keeps to 24 bars however long the drawer stayed open", () => {
    const view = takingsOverTime(at("2026-09-01T06:00:00Z"), at("2026-10-05T06:00:00Z"), []);
    expect(view.bars.length).toBeLessThanOrEqual(24);
    expect(view.hoursEach % 24).toBe(0);
  });
});
