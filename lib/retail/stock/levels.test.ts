import { describe, expect, it } from "vitest";

import { COVER_AIM, daysOfCover, stockLevel } from "./levels";

const line = (onHand: number, reorderAt: number | null, soldLast30: number, archived = false) =>
  stockLevel({ onHand, reorderAt, soldLast30, archived });

describe("how a stock line is doing", () => {
  it("calls Amarula low above its reorder level, because it has under a week of cover", () => {
    // 13 on hand, reorder at 12, 63 sold in 30 days: 2.1 a day, about 6 days.
    expect(daysOfCover(13, 63, 30)).toBeCloseTo(6.19, 2);
    expect(line(13, 12, 63)).toBe("LOW");
  });

  it("calls Gordon's fine at about eight days of cover", () => {
    expect(line(18, 6, 68)).toBe("FINE");
  });

  it("calls Chibuku too much at about sixty-two days of cover", () => {
    expect(line(210, 60, 102)).toBe("TOO_MUCH");
  });

  it("calls an empty line out, whatever else is true of it", () => {
    expect(line(0, 6, 18)).toBe("OUT");
    expect(line(0, null, 0, true)).toBe("OUT");
  });

  it("calls stock that sold nothing in 30 days too much", () => {
    expect(line(40, null, 0)).toBe("TOO_MUCH");
    // Refunds outrunning sales is still nothing sold.
    expect(line(40, null, -2)).toBe("TOO_MUCH");
  });

  it("calls a line at its reorder level low even when it sold nothing", () => {
    expect(line(6, 6, 0)).toBe("LOW");
  });

  it("never calls an archived product low", () => {
    expect(line(13, 12, 63, true)).toBe("FINE");
    expect(line(2, 12, 63, true)).not.toBe("LOW");
  });

  it("aims for two weeks of cover", () => {
    expect(COVER_AIM).toBe(14);
    // 30 sold in 30 days is one a day; 14 on hand lasts 14 days.
    expect(daysOfCover(14, 30, 30)).toBe(14);
    expect(daysOfCover(14, 0, 30)).toBeNull();
  });
});
