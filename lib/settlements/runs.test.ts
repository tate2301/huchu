/**
 * Settlement runs, against a real Postgres.
 *
 * Two things are being proved. First, that quantity and money stay separate all
 * the way through — the bug this domain exists to fix is a gold weight living in
 * `PayrollLineItem.baseAmount`, a money column, where four decimal places had to
 * be granted to a payroll table so a mining weight would survive it.
 *
 * Second, that the same grams cannot be settled twice. The path this replaces had
 * no answer to "is this allocation settled?" — it wrote the allocation's UUID into
 * a free-text notes column and read it back with a regex — so two runs over
 * overlapping windows would both pay for the same shift.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";

import { prisma } from "@/lib/prisma";
import { buildSettlementRunDraft } from "./runs";
import { persistSettlementRun } from "./persist";

const PERIOD_START = new Date("2026-08-01T00:00:00.000Z");
const PERIOD_END = new Date("2026-08-31T23:59:59.999Z");
const DUE_DATE = new Date("2026-09-05T00:00:00.000Z");

let companyId: string;
let actorId: string;
let siteId: string;
let farai: string;
let tendai: string;

async function makeEmployee(name: string, employeeId: string, currency = "USD") {
  const employee = await prisma.employee.create({
    data: {
      companyId,
      employeeId,
      name,
      phone: "0770000000",
      nextOfKinName: "Kin",
      nextOfKinPhone: "0770000001",
      passportPhotoUrl: "https://example.invalid/p.jpg",
      villageOfOrigin: "Village",
      defaultCurrency: currency,
    },
    select: { id: true },
  });
  return employee.id;
}

/**
 * One approved gold allocation with worker shares.
 *
 * `GoldShiftAllocation.shiftReportId` is unique and required, so a shift report
 * has to exist — the settlement chain genuinely hangs off a production record.
 */
async function makeAllocation(input: {
  date: Date;
  pricePerGram: string | null;
  shares: Array<{ employeeId: string; weight: string; valueUsd: string | null }>;
  payCycleWeeks?: number;
}) {
  const report = await prisma.shiftReport.create({
    data: {
      date: input.date,
      shift: "DAY",
      siteId,
      groupLeaderId: input.shares[0].employeeId,
      crewCount: input.shares.length,
      workType: "EXTRACTION",
      createdById: actorId,
    },
    select: { id: true },
  });

  const totalWeight = input.shares.reduce(
    (sum, share) => sum + Number(share.weight),
    0,
  );

  const allocation = await prisma.goldShiftAllocation.create({
    data: {
      date: input.date,
      shift: "DAY",
      siteId,
      companyId,
      shiftReportId: report.id,
      totalWeight: String(totalWeight * 2),
      netWeight: String(totalWeight * 2),
      workerShareWeight: String(totalWeight),
      companyShareWeight: String(totalWeight),
      perWorkerWeight: String(totalWeight / input.shares.length),
      goldPriceUsdPerGram: input.pricePerGram,
      payCycleWeeks: input.payCycleWeeks ?? 2,
      workflowStatus: "APPROVED",
      createdById: actorId,
      workerShares: {
        create: input.shares.map((share) => ({
          employeeId: share.employeeId,
          shareWeight: share.weight,
          shareValueUsd: share.valueUsd,
        })),
      },
    },
    select: { id: true },
  });
  return allocation.id;
}

async function makeIntake(input: {
  source: "SCRAP" | "COMMISSION" | "OTHER";
  dueDate: Date;
  status?: "DRAFT" | "APPROVED";
  items: Array<{ employeeId: string; quantity: string; unit: string; amount: string }>;
}) {
  const intake = await prisma.settlementIntake.create({
    data: {
      companyId,
      source: input.source,
      label: `${input.source} intake`,
      periodStart: PERIOD_START,
      periodEnd: PERIOD_END,
      dueDate: input.dueDate,
      workflowStatus: input.status ?? "APPROVED",
      createdById: actorId,
      items: { create: input.items },
    },
    select: { id: true },
  });
  return intake.id;
}

beforeAll(async () => {
  const stamp = Date.now();
  const company = await prisma.company.create({
    data: { name: `Settlements ${stamp}`, slug: `settlements-${stamp}` },
    select: { id: true },
  });
  companyId = company.id;

  const actor = await prisma.user.create({
    data: {
      companyId,
      email: `settlements-${stamp}@example.invalid`,
      name: "Settlement Actor",
      password: "not-a-real-password",
      role: "MANAGER",
    },
    select: { id: true },
  });
  actorId = actor.id;

  const site = await prisma.site.create({
    data: { companyId, name: "Shaft 2", code: `S2-${stamp}`, location: "Kadoma" },
    select: { id: true },
  });
  siteId = site.id;

  farai = await makeEmployee("Farai Dube", "EMP-001");
  tendai = await makeEmployee("Tendai Zulu", "EMP-002");
});

afterAll(async () => {
  if (!companyId) return;
  await prisma.company.delete({ where: { id: companyId } }).catch(() => {});
});

describe("gold settlement runs", () => {
  it("sums a worker's shares across shifts and keeps grams out of the money column", async () => {
    await makeAllocation({
      date: new Date("2026-08-05T00:00:00.000Z"),
      pricePerGram: "62.5000",
      shares: [
        { employeeId: farai, weight: "4.2500", valueUsd: "265.63" },
        { employeeId: tendai, weight: "3.0000", valueUsd: "187.50" },
      ],
    });
    await makeAllocation({
      date: new Date("2026-08-19T00:00:00.000Z"),
      pricePerGram: "64.0000",
      shares: [{ employeeId: farai, weight: "2.7500", valueUsd: "176.00" }],
    });

    const draft = await buildSettlementRunDraft({
      companyId,
      source: "GOLD",
      periodStart: PERIOD_START,
      periodEnd: PERIOD_END,
      mode: "CURRENT_PERIOD",
      baseCurrency: "USD",
    });

    expect(draft).not.toBeNull();
    const faraiLine = draft!.lines.find((line) => line.employeeId === farai)!;

    // 4.25 g + 2.75 g, at four places, in a quantity column.
    expect(faraiLine.quantity.toString()).toBe("7");
    expect(faraiLine.unit).toBe("g");
    // 265.63 + 176.00, at two places, in a money column.
    expect(faraiLine.grossAmount.toString()).toBe("441.63");
    // The rate is derived from what happened, not asked for: 441.63 / 7.
    expect(faraiLine.unitRate.toString()).toBe("63.09");
    // Two shifts contributed, and the line says which.
    expect(faraiLine.origins).toHaveLength(2);

    expect(draft!.totals.totalQuantity.toString()).toBe("10");
    expect(draft!.totals.totalAmount.toString()).toBe("629.13");
  });

  it("settles on the due date under NEXT_PERIOD, not the shift date", async () => {
    // A shift on 29 July with a two-week cycle falls due 12 August.
    await makeAllocation({
      date: new Date("2026-07-29T00:00:00.000Z"),
      pricePerGram: "60.0000",
      shares: [{ employeeId: tendai, weight: "1.5000", valueUsd: "90.00" }],
      payCycleWeeks: 2,
    });

    const currentPeriod = await buildSettlementRunDraft({
      companyId,
      source: "GOLD",
      periodStart: PERIOD_START,
      periodEnd: PERIOD_END,
      mode: "CURRENT_PERIOD",
      baseCurrency: "USD",
    });
    const nextPeriod = await buildSettlementRunDraft({
      companyId,
      source: "GOLD",
      periodStart: PERIOD_START,
      periodEnd: PERIOD_END,
      mode: "NEXT_PERIOD",
      baseCurrency: "USD",
    });

    const inCurrent = currentPeriod!.lines
      .find((line) => line.employeeId === tendai)!
      .origins.length;
    const inNext = nextPeriod!.lines
      .find((line) => line.employeeId === tendai)!
      .origins.length;

    // The July shift is outside August, so CURRENT_PERIOD ignores it and
    // NEXT_PERIOD picks it up.
    expect(inNext).toBe(inCurrent + 1);
  });

  it("refuses to settle the same shift twice", async () => {
    const before = await buildSettlementRunDraft({
      companyId,
      source: "GOLD",
      periodStart: PERIOD_START,
      periodEnd: PERIOD_END,
      mode: "CURRENT_PERIOD",
      baseCurrency: "USD",
    });
    expect(before).not.toBeNull();

    await prisma.$transaction((tx) =>
      persistSettlementRun(tx, {
        companyId,
        draft: before!,
        periodStart: PERIOD_START,
        periodEnd: PERIOD_END,
        dueDate: DUE_DATE,
        baseCurrency: "USD",
        createdById: actorId,
      }),
    );

    // Same window, same source, immediately after. Every gram is claimed.
    const after = await buildSettlementRunDraft({
      companyId,
      source: "GOLD",
      periodStart: PERIOD_START,
      periodEnd: PERIOD_END,
      mode: "CURRENT_PERIOD",
      baseCurrency: "USD",
    });
    expect(after).toBeNull();
  });

  it("records who created the run in the same transaction as the run", async () => {
    const audit = await prisma.approvalAction.findFirst({
      where: { companyId, entityType: "SETTLEMENT_RUN", action: "CREATE" },
      select: { actedById: true, toStatus: true },
    });
    expect(audit?.actedById).toBe(actorId);
    expect(audit?.toStatus).toBe("DRAFT");
  });

  it("lets a recompute of the same run reclaim its own grams", async () => {
    const run = await prisma.settlementRun.findFirstOrThrow({
      where: { companyId, source: "GOLD" },
      select: { id: true },
    });

    const recompute = await buildSettlementRunDraft({
      companyId,
      source: "GOLD",
      periodStart: PERIOD_START,
      periodEnd: PERIOD_END,
      mode: "CURRENT_PERIOD",
      baseCurrency: "USD",
      excludeRunId: run.id,
    });

    expect(recompute).not.toBeNull();
    expect(recompute!.totals.totalQuantity.toString()).toBe("10");
  });
});

describe("intake settlement runs", () => {
  it("sums approved intakes and ignores drafts", async () => {
    await makeIntake({
      source: "SCRAP",
      dueDate: new Date("2026-08-20T00:00:00.000Z"),
      items: [
        { employeeId: farai, quantity: "120.0000", unit: "kg", amount: "84.00" },
        { employeeId: tendai, quantity: "80.0000", unit: "kg", amount: "56.00" },
      ],
    });
    await makeIntake({
      source: "SCRAP",
      dueDate: new Date("2026-08-25T00:00:00.000Z"),
      status: "DRAFT",
      items: [{ employeeId: farai, quantity: "999.0000", unit: "kg", amount: "700.00" }],
    });

    const draft = await buildSettlementRunDraft({
      companyId,
      source: "SCRAP",
      periodStart: PERIOD_START,
      periodEnd: PERIOD_END,
      mode: "CURRENT_PERIOD",
      baseCurrency: "USD",
      unit: "kg",
    });

    const faraiLine = draft!.lines.find((line) => line.employeeId === farai)!;
    // The draft intake's 999 kg is not here — an unapproved intake is a proposal.
    expect(faraiLine.quantity.toString()).toBe("120");
    expect(faraiLine.grossAmount.toString()).toBe("84");
    expect(faraiLine.unit).toBe("kg");
    expect(draft!.totals.totalAmount.toString()).toBe("140");
  });

  it("returns null when there is nothing to settle rather than an empty run", async () => {
    const draft = await buildSettlementRunDraft({
      companyId,
      source: "COMMISSION",
      periodStart: PERIOD_START,
      periodEnd: PERIOD_END,
      mode: "CURRENT_PERIOD",
      baseCurrency: "USD",
    });
    // An empty run is a record that somebody settled nothing, which then has to
    // be approved and cancelled.
    expect(draft).toBeNull();
  });
});
