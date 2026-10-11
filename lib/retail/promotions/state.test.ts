import { describe, expect, it } from "vitest";

import { momentWords, parsePromotionMoment, promotionBadge, promotionState, tomorrowStart } from "./state";

/**
 * A promotion's state by the clock (PRD-09): Ended, Paused, Scheduled,
 * Running; and the running badge's "Ends today" / "Ends tomorrow", whose
 * days turn at midnight in Harare (UTC+2), not at midnight UTC.
 */

const harare = (local: string) => new Date(`${local}+02:00`);
const clock = (extra: Partial<Parameters<typeof promotionState>[0]> = {}) => ({
  startsAt: harare("2026-09-02T00:00:00"),
  endsAt: null,
  pausedAt: null,
  endedAt: null,
  ...extra,
});

describe("promotionState", () => {
  const now = harare("2026-10-07T12:00:00");

  it("reads the clock", () => {
    expect(promotionState(clock(), now)).toBe("RUNNING");
    expect(promotionState(clock({ startsAt: harare("2026-12-01T00:00:00") }), now)).toBe("SCHEDULED");
    expect(promotionState(clock({ pausedAt: now }), now)).toBe("PAUSED");
    expect(promotionState(clock({ endsAt: harare("2026-10-07T11:59:00") }), now)).toBe("ENDED");
    expect(promotionState(clock({ endedAt: now, pausedAt: now }), now)).toBe("ENDED");
  });
});

describe("promotionBadge", () => {
  it("says Ends today until the shop's midnight, then Ends tomorrow the day before", () => {
    const endsAt = harare("2026-10-08T23:59:00");
    // 23:30 Harare on the 7th is 21:30 UTC: still the 7th, so the 8th is tomorrow.
    expect(promotionBadge(clock({ endsAt }), harare("2026-10-07T23:30:00"))).toEqual({ label: "Ends tomorrow", tone: "warn" });
    // 00:30 Harare on the 8th is 22:30 UTC on the 7th: the 8th is today in the shop.
    expect(promotionBadge(clock({ endsAt }), harare("2026-10-08T00:30:00"))).toEqual({ label: "Ends today", tone: "warn" });
    expect(promotionBadge(clock({ endsAt }), harare("2026-10-06T23:59:00"))).toEqual({ label: "Running", tone: "ok" });
  });

  it("names the other states in their tones", () => {
    const now = harare("2026-10-07T12:00:00");
    expect(promotionBadge(clock({ startsAt: harare("2026-12-01T00:00:00") }), now)).toEqual({ label: "Scheduled", tone: "info" });
    expect(promotionBadge(clock({ pausedAt: now }), now)).toEqual({ label: "Paused", tone: "warn" });
    expect(promotionBadge(clock({ endedAt: now }), now)).toEqual({ label: "Ended", tone: "neutral" });
  });
});

describe("parsePromotionMoment", () => {
  const now = harare("2026-10-07T12:00:00");

  it("reads the picker's value and the words, on Harare's clock", () => {
    expect(parsePromotionMoment("2026-10-25T00:00", now)?.toISOString()).toBe("2026-10-24T22:00:00.000Z");
    expect(parsePromotionMoment("25 October, 00:00", now)?.toISOString()).toBe("2026-10-24T22:00:00.000Z");
    expect(parsePromotionMoment("31 Oct, 23:59", now)?.toISOString()).toBe("2026-10-31T21:59:00.000Z");
  });

  it("takes the next time the day comes round when no year is written", () => {
    expect(parsePromotionMoment("2 September, 00:00", now)?.toISOString()).toBe("2027-09-01T22:00:00.000Z");
    expect(parsePromotionMoment("7 October, 08:00", now)?.toISOString()).toBe("2026-10-07T06:00:00.000Z");
  });

  it("refuses what is not a moment", () => {
    expect(parsePromotionMoment("someday", now)).toBeNull();
    expect(parsePromotionMoment("31 February, 10:00", now)).toBeNull();
    expect(parsePromotionMoment("2026-10-25T25:00", now)).toBeNull();
  });

  it("says a moment back, and knows tomorrow's start", () => {
    expect(momentWords(harare("2026-09-02T00:00:00"), true)).toBe("2 September 2026, 00:00");
    expect(tomorrowStart(harare("2026-10-07T23:30:00")).toISOString()).toBe("2026-10-07T22:00:00.000Z");
  });
});
