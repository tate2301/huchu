import { describe, expect, it } from "vitest";

import {
  armedRules,
  failureGroups,
  formatDuration,
  rulePerformance,
  runTotals,
  triggerAppliesTo,
  type RunRecord,
} from "./run-insights";

function run(overrides: Partial<RunRecord> = {}): RunRecord {
  return {
    automationId: "a1",
    automationName: "Chase new leads",
    status: "SUCCEEDED",
    durationMs: 100,
    actionCount: 1,
    createdAt: "2026-03-01T00:00:00Z",
    result: [{ type: "CREATE_TASK", ok: true }],
    ...overrides,
  };
}

describe("runTotals", () => {
  it("counts a half-worked run against the clean rate", () => {
    // A rule that half-worked is a rule somebody has to finish by hand, which
    // is the thing automation was supposed to remove.
    const totals = runTotals([
      run(),
      run({ status: "PARTIAL" }),
      run({ status: "FAILED" }),
      run({ status: "SUCCEEDED" }),
    ]);

    expect(totals.succeeded).toBe(2);
    expect(totals.partial).toBe(1);
    expect(totals.failed).toBe(1);
    expect(totals.cleanRate).toBe(0.5);
  });

  it("totals the actions carried out, not just the firings", () => {
    // A rule that fires rarely and does eight things costs more than one that
    // fires often and sets a field.
    const totals = runTotals([run({ actionCount: 8 }), run({ actionCount: 1 })]);
    expect(totals.runs).toBe(2);
    expect(totals.actionsRun).toBe(9);
  });

  it("reports median, average and slowest from timed runs only", () => {
    const totals = runTotals([
      run({ durationMs: 100 }),
      run({ durationMs: 200 }),
      run({ durationMs: 5_000 }),
    ]);

    expect(totals.medianMs).toBe(200);
    expect(totals.averageMs).toBe(1767);
    expect(totals.slowestMs).toBe(5_000);
  });

  it("does not count an untimed run as instant", () => {
    // Runs recorded before duration was measured have no duration. Treating
    // that as zero drags every average toward a number nobody observed.
    const totals = runTotals([run({ durationMs: null }), run({ durationMs: 400 })]);

    expect(totals.averageMs).toBe(400);
    expect(totals.medianMs).toBe(400);
    expect(totals.untimed).toBe(1);
  });

  it("says nothing rather than zero when nothing was timed", () => {
    const totals = runTotals([run({ durationMs: null })]);
    expect(totals.medianMs).toBeNull();
    expect(totals.averageMs).toBeNull();
    expect(totals.slowestMs).toBeNull();
  });

  it("divides by nothing safely", () => {
    expect(runTotals([])).toMatchObject({ runs: 0, cleanRate: 0, medianMs: null });
  });
});

describe("rulePerformance", () => {
  it("ranks by how often a rule goes wrong, not by how often it runs", () => {
    const rows = rulePerformance([
      ...Array.from({ length: 100 }, () => run({ automationId: "busy", automationName: "Busy" })),
      run({ automationId: "broken", automationName: "Broken", status: "FAILED" }),
      run({ automationId: "broken", automationName: "Broken", status: "SUCCEEDED" }),
    ]);

    expect(rows[0].automationId).toBe("broken");
    expect(rows[0].troubleRate).toBe(0.5);
    expect(rows[1].runs).toBe(100);
  });

  it("counts partial runs as trouble too", () => {
    const [row] = rulePerformance([run({ status: "PARTIAL" }), run()]);
    expect(row.partial).toBe(1);
    expect(row.troubleRate).toBe(0.5);
  });

  it("breaks a tie on trouble by how much of it there is", () => {
    const rows = rulePerformance([
      run({ automationId: "small", automationName: "Small", status: "FAILED" }),
      run({ automationId: "big", automationName: "Big", status: "FAILED" }),
      run({ automationId: "big", automationName: "Big", status: "FAILED" }),
    ]);

    expect(rows[0].automationId).toBe("big");
  });
});

describe("failureGroups", () => {
  it("turns forty failures into the one problem they are", () => {
    const runs = Array.from({ length: 40 }, () =>
      run({
        status: "FAILED",
        result: [{ type: "ASSIGN_OWNER", ok: false, detail: "User not found" }],
      }),
    );

    expect(failureGroups(runs)).toEqual([
      { action: "ASSIGN_OWNER", detail: "User not found", count: 40 },
    ]);
  });

  it("keeps the same message from different actions apart", () => {
    const groups = failureGroups([
      run({
        status: "PARTIAL",
        result: [
          { type: "ASSIGN_OWNER", ok: false, detail: "Record not found" },
          { type: "SET_FIELD", ok: false, detail: "Record not found" },
        ],
      }),
    ]);

    expect(groups).toHaveLength(2);
  });

  it("ignores the actions that worked", () => {
    const groups = failureGroups([
      run({
        status: "PARTIAL",
        result: [
          { type: "CREATE_TASK", ok: true },
          { type: "NOTIFY", ok: false, detail: "No recipients" },
        ],
      }),
    ]);

    expect(groups).toEqual([{ action: "NOTIFY", detail: "No recipients", count: 1 }]);
  });

  it("survives a result the runner never wrote", () => {
    expect(failureGroups([run({ result: null }), run({ result: "broken" })])).toEqual([]);
  });
});

describe("formatDuration", () => {
  it("reads in the units somebody thinks in", () => {
    expect(formatDuration(120)).toBe("120ms");
    expect(formatDuration(1_500)).toBe("1.5s");
    expect(formatDuration(45_000)).toBe("45s");
    expect(formatDuration(180_000)).toBe("3m");
  });

  it("says nothing rather than zero when there is nothing to say", () => {
    expect(formatDuration(null)).toBe("—");
  });
});

describe("armedRules", () => {
  const rules = [
    { id: "r1", name: "Chase new leads", trigger: "LEAD_CREATED", isEnabled: true },
    { id: "r2", name: "Thank on payment", trigger: "PAYMENT_RECEIVED", isEnabled: true },
    { id: "r3", name: "Nudge idle", trigger: "RECORD_IDLE", isEnabled: true },
    { id: "r4", name: "Turned off", trigger: "LEAD_CREATED", isEnabled: false },
  ];

  it("does not promise a lead something only a deal can trigger", () => {
    // The document triggers fire against a deal and read nothing like it.
    // Listing them on a lead would promise something the engine never does.
    expect(armedRules(rules, "LEAD").map((rule) => rule.id)).toEqual(["r1", "r3"]);
  });

  it("lists what can still fire on a deal", () => {
    expect(armedRules(rules, "DEAL").map((rule) => rule.id)).toEqual(["r2", "r3"]);
  });

  it("leaves a disabled rule out — it is not waiting, it is off", () => {
    expect(armedRules(rules, "LEAD").some((rule) => rule.id === "r4")).toBe(false);
  });

  it("arms nothing on a record type no trigger reaches", () => {
    expect(armedRules(rules, "SITE")).toEqual([]);
  });

  it("treats a trigger it has never heard of as reaching nothing", () => {
    expect(triggerAppliesTo("INVENTED_TRIGGER", "LEAD")).toBe(false);
  });
});
