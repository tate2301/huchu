import { describe, expect, it } from "vitest";

import {
  biggestLeak,
  bucketByPeriod,
  bucketSeries,
  buildFunnel,
  forecast,
  medianCycleDays,
  medianDaysInStage,
  rangeToDates,
  shareSlices,
  summarizeGroups,
  winRate,
} from "./reports";

const stages = [
  { key: "new", label: "New", reached: 200, value: 400_000 },
  { key: "qualified", label: "Qualified", reached: 120, value: 300_000 },
  { key: "quoted", label: "Quoted", reached: 40, value: 150_000 },
  { key: "won", label: "Won", reached: 30, value: 120_000 },
];

describe("buildFunnel", () => {
  it("measures each stage against the one before it, not against the top", () => {
    // "We lose two thirds between qualified and quoted" is actionable;
    // "15% of leads convert" is not.
    const funnel = buildFunnel(stages);
    expect(funnel[1].conversionFromPrevious).toBeCloseTo(0.6);
    expect(funnel[2].conversionFromPrevious).toBeCloseTo(1 / 3);
    expect(funnel[3].conversionFromPrevious).toBeCloseTo(0.75);
  });

  it("also reports the share of everything that entered", () => {
    const funnel = buildFunnel(stages);
    expect(funnel[3].shareOfTotal).toBeCloseTo(0.15);
    expect(funnel[0].shareOfTotal).toBe(1);
  });

  it("counts the first stage as converting from itself", () => {
    expect(buildFunnel(stages)[0].conversionFromPrevious).toBe(1);
    expect(buildFunnel(stages)[0].droppedFromPrevious).toBe(0);
  });

  it("divides by nothing safely on an empty pipeline", () => {
    const empty = buildFunnel([
      { key: "new", label: "New", reached: 0, value: 0 },
      { key: "won", label: "Won", reached: 0, value: 0 },
    ]);
    expect(empty[1].conversionFromPrevious).toBe(0);
    expect(empty[1].shareOfTotal).toBe(0);
  });

  it("handles no stages at all", () => {
    expect(buildFunnel([])).toEqual([]);
  });
});

describe("biggestLeak", () => {
  it("names the stage that loses the most", () => {
    const funnel = buildFunnel([
      { key: "new", label: "New", reached: 200, value: 0 },
      { key: "qualified", label: "Qualified", reached: 150, value: 0 },
      { key: "quoted", label: "Quoted", reached: 40, value: 0 },
      { key: "won", label: "Won", reached: 30, value: 0 },
    ]);
    expect(biggestLeak(funnel)?.key).toBe("quoted");
  });

  it("blames the later stage when two lose equally", () => {
    // Losing fifty deals after quoting them costs fifty quotes' worth of work;
    // losing fifty at the top costs an hour of somebody's morning.
    expect(biggestLeak(buildFunnel(stages))?.key).toBe("quoted");
  });

  it("returns nothing when there is nowhere to leak", () => {
    expect(biggestLeak(buildFunnel([stages[0]]))).toBeNull();
  });
});

describe("winRate", () => {
  it("counts only decided business", () => {
    // Counting open deals as losses makes a growing pipeline look like a
    // failing one.
    expect(winRate({ won: 3, lost: 1, open: 96 })).toBe(0.75);
  });

  it("is zero rather than NaN before anything closes", () => {
    expect(winRate({ won: 0, lost: 0, open: 10 })).toBe(0);
  });
});

describe("medianCycleDays", () => {
  it("uses the median so one runaway deal doesn't set the number", () => {
    const records = [
      { openedAt: "2026-01-01", closedAt: "2026-01-11" },
      { openedAt: "2026-01-01", closedAt: "2026-01-21" },
      { openedAt: "2026-01-01", closedAt: "2027-01-01" },
    ];
    expect(medianCycleDays(records)).toBe(20);
  });

  it("averages the middle two when the count is even", () => {
    const records = [
      { openedAt: "2026-01-01", closedAt: "2026-01-11" },
      { openedAt: "2026-01-01", closedAt: "2026-01-21" },
    ];
    expect(medianCycleDays(records)).toBe(15);
  });

  it("ignores what hasn't closed", () => {
    const records = [
      { openedAt: "2026-01-01", closedAt: null },
      { openedAt: "2026-01-01", closedAt: "2026-01-11" },
    ];
    expect(medianCycleDays(records)).toBe(10);
  });

  it("returns nothing rather than zero when nothing has closed", () => {
    expect(medianCycleDays([{ openedAt: "2026-01-01", closedAt: null }])).toBeNull();
  });
});

describe("summarizeGroups", () => {
  const groups = [
    { key: "a", label: "Ama", won: 3, lost: 1, open: 2, wonValue: 30_000, openValue: 5_000 },
    { key: "b", label: "Ben", won: 1, lost: 4, open: 1, wonValue: 50_000, openValue: 2_000 },
  ];

  it("ranks by money won, not by count", () => {
    expect(summarizeGroups(groups).map((group) => group.key)).toEqual(["b", "a"]);
  });

  it("reports both win rate and average size, which say different things", () => {
    const [ben, ama] = summarizeGroups(groups);
    expect(ama.winRate).toBe(0.75);
    expect(ben.winRate).toBeCloseTo(0.2);
    expect(ben.averageWonValue).toBe(50_000);
  });

  it("doesn't divide by zero for somebody who has won nothing", () => {
    const [only] = summarizeGroups([
      { key: "c", label: "Chi", won: 0, lost: 2, open: 1, wonValue: 0, openValue: 0 },
    ]);
    expect(only.averageWonValue).toBe(0);
  });
});

describe("forecast", () => {
  it("weights each deal by its own probability", () => {
    const result = forecast([
      { value: 10_000, probability: 25 },
      { value: 10_000, probability: 75 },
    ]);
    expect(result.weighted).toBe(10_000);
    expect(result.unweighted).toBe(20_000);
    expect(result.count).toBe(2);
  });

  it("falls back to a default rather than treating a blank as certain", () => {
    expect(forecast([{ value: 10_000, probability: null }]).weighted).toBe(5_000);
  });

  it("says how much of the figure is resting on that default", () => {
    const result = forecast([
      { value: 10_000, probability: 80 },
      { value: 10_000, probability: null },
      { value: 5_000, probability: null },
    ]);
    expect(result.estimated).toBe(2);
    expect(result.count).toBe(3);
  });

  it("reports nothing estimated when every deal carries a probability", () => {
    expect(forecast([{ value: 10_000, probability: 0 }]).estimated).toBe(0);
  });

  it("clamps a nonsense probability instead of inflating the number", () => {
    expect(forecast([{ value: 10_000, probability: 400 }]).weighted).toBe(10_000);
    expect(forecast([{ value: 10_000, probability: -50 }]).weighted).toBe(0);
  });

  it("treats a deal with no value as zero, not as a crash", () => {
    expect(forecast([{ value: null, probability: 50 }]).weighted).toBe(0);
  });
});

describe("bucketByPeriod", () => {
  const range = { from: new Date("2026-03-01T00:00:00Z"), to: new Date("2026-03-05T00:00:00Z") };

  it("emits quiet days as zero rather than skipping them", () => {
    // A chart that omits a quiet day draws a straight line through it and
    // hides the thing somebody opened the chart to see.
    const buckets = bucketByPeriod(["2026-03-01T10:00:00Z", "2026-03-03T10:00:00Z"], range);
    expect(buckets).toHaveLength(5);
    expect(buckets.map((bucket) => bucket.count)).toEqual([1, 0, 1, 0, 0]);
  });

  it("counts several events in one day together", () => {
    const buckets = bucketByPeriod(
      ["2026-03-02T08:00:00Z", "2026-03-02T18:00:00Z"],
      range,
    );
    expect(buckets[1].count).toBe(2);
  });

  it("rolls into weeks when asked", () => {
    const wide = { from: new Date("2026-03-01T00:00:00Z"), to: new Date("2026-03-22T00:00:00Z") };
    const buckets = bucketByPeriod(
      ["2026-03-02T00:00:00Z", "2026-03-04T00:00:00Z", "2026-03-10T00:00:00Z"],
      wide,
      "week",
    );
    expect(buckets[0].count).toBe(2);
    expect(buckets[1].count).toBe(1);
  });

  it("ignores a timestamp that isn't one", () => {
    expect(bucketByPeriod(["not a date"], range).every((bucket) => bucket.count === 0)).toBe(true);
  });
});

describe("rangeToDates", () => {
  const now = new Date("2026-03-15T14:00:00Z");

  it("starts each range at the beginning of its first day", () => {
    const { from } = rangeToDates("7d", now);
    expect(from.getHours()).toBe(0);
    expect(from.getMinutes()).toBe(0);
  });

  it("goes back a year for the twelve-month range", () => {
    const { from } = rangeToDates("12m", now);
    expect(from.getFullYear()).toBe(2025);
    expect(from.getMonth()).toBe(2);
  });
});

describe("bucketSeries", () => {
  const range = { from: new Date("2026-03-01T00:00:00Z"), to: new Date("2026-03-05T00:00:00Z") };

  it("sums a value alongside the count", () => {
    const buckets = bucketSeries(
      [
        { at: "2026-03-02T09:00:00Z", value: 1200 },
        { at: "2026-03-02T17:00:00Z", value: 300 },
      ],
      range,
    );
    const day = buckets.find((bucket) => bucket.period === "2026-03-02");
    expect(day).toEqual({ period: "2026-03-02", count: 2, value: 1500 });
  });

  it("treats a missing value as nothing rather than as a hole", () => {
    const buckets = bucketSeries([{ at: "2026-03-03T09:00:00Z" }], range);
    const day = buckets.find((bucket) => bucket.period === "2026-03-03");
    expect(day).toEqual({ period: "2026-03-03", count: 1, value: 0 });
  });
});

describe("medianDaysInStage", () => {
  const now = new Date("2026-03-20T00:00:00Z");

  it("measures each span from when the deal entered the stage", () => {
    const result = medianDaysInStage(
      [
        {
          id: "d1",
          createdAt: "2026-03-01T00:00:00Z",
          closedAt: "2026-03-11T00:00:00Z",
          currentStageId: "won",
        },
      ],
      [
        { dealId: "d1", fromStageId: "new", toStageId: "quoted", at: "2026-03-03T00:00:00Z" },
        { dealId: "d1", fromStageId: "quoted", toStageId: "won", at: "2026-03-10T00:00:00Z" },
      ],
      now,
    );

    expect(result.new).toBe(2);
    expect(result.quoted).toBe(7);
    expect(result.won).toBe(1);
  });

  it("counts a deal that has never moved as still sitting where it is", () => {
    const result = medianDaysInStage(
      [
        {
          id: "d1",
          createdAt: "2026-03-15T00:00:00Z",
          closedAt: null,
          currentStageId: "new",
        },
      ],
      [],
      now,
    );

    expect(result.new).toBe(5);
  });

  it("keeps counting an open deal, because a deal parked for weeks is the point", () => {
    const result = medianDaysInStage(
      [{ id: "d1", createdAt: "2026-01-01T00:00:00Z", closedAt: null, currentStageId: "s1" }],
      [{ dealId: "d1", fromStageId: "s1", toStageId: "s2", at: "2026-01-05T00:00:00Z" }],
      now,
    );

    expect(result.s1).toBe(4);
    expect(result.s2).toBeGreaterThan(70);
  });

  it("takes the median so one stalled deal does not redefine normal", () => {
    const deals = [1, 2, 3].map((n) => ({
      id: `d${n}`,
      createdAt: "2026-03-01T00:00:00Z",
      closedAt: null,
      currentStageId: "s1",
    }));
    const changes = [
      { dealId: "d1", fromStageId: "s1", toStageId: "s2", at: "2026-03-02T00:00:00Z" },
      { dealId: "d2", fromStageId: "s1", toStageId: "s2", at: "2026-03-04T00:00:00Z" },
      { dealId: "d3", fromStageId: "s1", toStageId: "s2", at: "2026-06-01T00:00:00Z" },
    ];

    expect(medianDaysInStage(deals, changes, now).s1).toBe(3);
  });

  it("ignores a change with no destination recorded", () => {
    const result = medianDaysInStage(
      [{ id: "d1", createdAt: "2026-03-10T00:00:00Z", closedAt: null, currentStageId: "s1" }],
      [{ dealId: "d1", fromStageId: "s1", toStageId: null, at: "2026-03-12T00:00:00Z" }],
      now,
    );

    expect(result.s1).toBe(10);
  });
});

describe("shareSlices", () => {
  it("folds everything past the limit into one slice so the shares still sum", () => {
    const slices = shareSlices(
      [
        { key: "a", label: "A", value: 50 },
        { key: "b", label: "B", value: 30 },
        { key: "c", label: "C", value: 10 },
        { key: "d", label: "D", value: 6 },
        { key: "e", label: "E", value: 4 },
      ],
      3,
    );

    expect(slices).toHaveLength(4);
    expect(slices[3].label).toBe("Other (2)");
    expect(slices[3].value).toBe(10);
    expect(slices.reduce((sum, slice) => sum + slice.share, 0)).toBeCloseTo(1);
  });

  it("drops a slice of nothing, which has no angle to draw", () => {
    const slices = shareSlices([
      { key: "a", label: "A", value: 10 },
      { key: "b", label: "B", value: 0 },
      { key: "c", label: "C", value: -5 },
    ]);

    expect(slices.map((slice) => slice.key)).toEqual(["a"]);
    expect(slices[0].share).toBe(1);
  });

  it("returns nothing rather than a pie of zeros", () => {
    expect(shareSlices([{ key: "a", label: "A", value: 0 }])).toEqual([]);
  });
});
