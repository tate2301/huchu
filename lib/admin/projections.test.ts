import { describe, expect, it } from "vitest";

import { homeFigures, mixByVertical, monthStart, projectMonths, type ProjectionRow } from "@/lib/admin/projections";

const now = new Date("2026-10-15T10:00:00Z");
const on = (iso: string) => new Date(`${iso}T00:00:00Z`);

const row = (overrides: Partial<ProjectionRow> & Pick<ProjectionRow, "id" | "standing">): ProjectionRow => ({
  trialEndsAt: null,
  currentPeriodEnd: null,
  monthly: 0,
  lines: [],
  ...overrides,
});

/**
 * Six workspaces, one of each kind of money:
 * - kwik: retail, 3 members, paid to 28 Oct ($39)
 * - mine: gold + general, 8 members, paid to 10 Jan ($198)
 * - school: schools, 12 members, past due since 10 Oct ($99)
 * - farm: general, read-only since September ($39)
 * - salon: CRM trial ending 20 Oct ($39)
 * - garage: workshop trial ending 20 Nov, 6 members ($99)
 * - shut: suspended, which counts for nothing ($99)
 */
const rows: ProjectionRow[] = [
  row({ id: "kwik", standing: "Active", currentPeriodEnd: on("2026-10-28"), monthly: 39, lines: [{ vertical: "RETAIL", amount: 39 }] }),
  row({
    id: "mine",
    standing: "Active",
    currentPeriodEnd: on("2027-01-10"),
    monthly: 198,
    lines: [
      { vertical: "GOLD", amount: 99 },
      { vertical: "GENERAL", amount: 99 },
    ],
  }),
  row({ id: "school", standing: "Past due", currentPeriodEnd: on("2026-10-10"), monthly: 99, lines: [{ vertical: "SCHOOLS", amount: 99 }] }),
  row({ id: "farm", standing: "Read-only", currentPeriodEnd: on("2026-09-01"), monthly: 39, lines: [{ vertical: "GENERAL", amount: 39 }] }),
  row({ id: "salon", standing: "Trial", trialEndsAt: on("2026-10-20"), monthly: 39, lines: [{ vertical: "CRM", amount: 39 }] }),
  row({ id: "garage", standing: "Trial", trialEndsAt: on("2026-11-20"), monthly: 99, lines: [{ vertical: "WORKSHOP", amount: 99 }] }),
  row({ id: "shut", standing: "Suspended", currentPeriodEnd: on("2026-12-01"), monthly: 99, lines: [{ vertical: "RETAIL", amount: 99 }] }),
];

describe("Home's figures", () => {
  const figures = homeFigures(rows, now);

  it("counts monthly recurring revenue from the paying workspaces: active and past due", () => {
    expect(figures.mrr).toEqual({ value: 336, count: 3 });
  });

  it("counts what falls due between now and the month's end: periods ending and trials ending", () => {
    // kwik's period ends 28 Oct ($39); salon's trial ends 20 Oct ($39).
    expect(figures.dueThisMonth).toEqual({ value: 78, count: 2 });
  });

  it("splits past due from what is at risk, which adds the read-only", () => {
    expect(figures.pastDue).toEqual({ value: 99, count: 1 });
    expect(figures.atRisk).toEqual({ value: 138, count: 2 });
  });

  it("counts renewals in the next 30 days and trials ending in the next 14", () => {
    expect(figures.renewals30).toEqual({ value: 39, count: 1 });
    expect(figures.trialsEnding14).toEqual({ value: 39, count: 1 });
  });

  it("is all nothing with no workspaces", () => {
    expect(homeFigures([], now).mrr).toEqual({ value: 0, count: 0 });
  });
});

describe("the 12-month projection", () => {
  const months = projectMonths(rows, now);

  it("runs twelve months from this one", () => {
    expect(months).toHaveLength(12);
    expect(months[0].monthStart).toEqual(on("2026-10-01"));
    expect(months[11].monthStart).toEqual(on("2027-09-01"));
    expect(monthStart(on("2026-12-31"), 1)).toEqual(on("2027-01-01"));
  });

  it("counts as paid only the months a workspace's payments reach into", () => {
    // October: all three paying reach into it ($39 + $198 + $99).
    // November: kwik's period ended in October, school's too; mine is paid to January.
    expect(months.map((month) => month.paid)).toEqual([336, 198, 198, 198, 0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it("expects every paying workspace to renew and every trial to convert from the month it ends", () => {
    // October: $336 recurring + salon $39. From November: + garage $99.
    expect(months.map((month) => month.expected)).toEqual([375, 474, 474, 474, 474, 474, 474, 474, 474, 474, 474, 474]);
  });
});

describe("the mix by vertical", () => {
  it("adds up what the paying workspaces pay for each vertical, in the catalogue's order", () => {
    expect(mixByVertical(rows)).toEqual([
      { vertical: "GOLD", label: "Gold operations", workspaces: 1, value: 99 },
      { vertical: "SCHOOLS", label: "Schools", workspaces: 1, value: 99 },
      { vertical: "RETAIL", label: "Retail", workspaces: 1, value: 39 },
      { vertical: "GENERAL", label: "General business", workspaces: 1, value: 99 },
    ]);
  });
});
