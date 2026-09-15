/**
 * The ageing boundaries, which three screens draw and nobody may redefine.
 *
 * The day a balance falls due is the case worth pinning: it decides whether a
 * school in good standing reads as current or as a term's worth of arrears on
 * the morning the fees were due.
 */

import { describe, it, expect } from "vitest";
import { ageingBands, ageingBucket, daysPastDue } from "./ageing";

describe("ageingBucket", () => {
  it("holds a balance due today in Current", () => {
    expect(ageingBucket(0)).toBe("current");
  });

  it("holds a balance not yet due in Current", () => {
    expect(ageingBucket(-1)).toBe("current");
    expect(ageingBucket(-45)).toBe("current");
  });

  it("ages at each boundary", () => {
    expect(ageingBucket(1)).toBe("days30");
    expect(ageingBucket(30)).toBe("days30");
    expect(ageingBucket(31)).toBe("days60");
    expect(ageingBucket(60)).toBe("days60");
    expect(ageingBucket(61)).toBe("days90");
    expect(ageingBucket(90)).toBe("days90");
    expect(ageingBucket(91)).toBe("days90Plus");
    expect(ageingBucket(400)).toBe("days90Plus");
  });

  it("treats an unknown age as current rather than as ancient", () => {
    expect(ageingBucket(Number.NaN)).toBe("current");
  });
});

describe("daysPastDue", () => {
  const due = new Date("2026-05-12T00:00:00.000Z");

  it("is zero through the whole of the due date", () => {
    expect(daysPastDue(due, new Date("2026-05-12T00:00:00.000Z"))).toBe(0);
    expect(daysPastDue(due, new Date("2026-05-12T23:59:00.000Z"))).toBe(0);
    expect(ageingBucket(daysPastDue(due, new Date("2026-05-12T14:00:00.000Z")))).toBe(
      "current",
    );
  });

  it("turns over the day after", () => {
    expect(daysPastDue(due, new Date("2026-05-13T00:01:00.000Z"))).toBe(1);
    expect(daysPastDue(due, new Date("2026-06-11T00:00:00.000Z"))).toBe(30);
    expect(daysPastDue(due, new Date("2026-06-12T00:00:00.000Z"))).toBe(31);
  });

  it("is negative before the due date", () => {
    expect(daysPastDue(due, new Date("2026-05-11T00:00:00.000Z"))).toBe(-1);
  });

  it("reads an ISO string the way it reads a date", () => {
    expect(daysPastDue("2026-05-12T00:00:00.000Z", new Date("2026-05-20T00:00:00.000Z"))).toBe(8);
  });

  it("does not age a bill with no due date", () => {
    expect(daysPastDue(null)).toBe(0);
    expect(daysPastDue("not a date")).toBe(0);
  });
});

describe("ageingBands", () => {
  it("returns the five bands in order, with their labels", () => {
    expect(ageingBands({}).map((band) => band.label)).toEqual([
      "Current",
      "1–30 days",
      "31–60 days",
      "61–90 days",
      "90+ days",
    ]);
  });

  it("reads the arrears endpoint's name for the 90+ column", () => {
    const bands = ageingBands({ current: 100, days120Plus: 3920 });
    expect(bands.find((band) => band.key === "days90Plus")?.amount).toBe(3920);
    expect(bands.find((band) => band.key === "current")?.amount).toBe(100);
    expect(bands.find((band) => band.key === "days60")?.amount).toBe(0);
  });

  it("draws nothing rather than guessing when there is no summary", () => {
    expect(ageingBands(null).every((band) => band.amount === 0)).toBe(true);
  });
});
