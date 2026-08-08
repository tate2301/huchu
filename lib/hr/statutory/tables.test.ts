/**
 * Zimbabwe statutory table arithmetic.
 *
 * Two kinds of test here, and both matter for different reasons.
 *
 * The pure ones (`payeOn`, `contributionOn`, `creditValue`, `necDues`) need no
 * database and pin hand-worked figures. If one of these breaks, somebody is
 * being paid the wrong amount.
 *
 * The database ones pin the *refusals*. A payroll that quietly falls back to
 * last month's PAYE table is the failure this whole design exists to prevent,
 * so "throws when nothing covers August" is not a defensive nicety — it is the
 * feature.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  contributionOn,
  creditValue,
  findStatutoryGaps,
  MissingStatutoryTableError,
  necDues,
  payeOn,
  periodLabel,
  resolveNecAgreement,
  resolvePayeTable,
  resolveStatutoryRate,
  resolveTaxCredits,
  requireStatutoryRate,
  type ResolvedPayeTable,
} from "./tables";
import { seedZimbabweStatutoryPack, SEEDED_EFFECTIVE_FROM } from "./zimbabwe-pack";

const d = (value: string) => new Prisma.Decimal(value);

/** The seeded USD monthly table, as a literal, so the pure tests need no DB. */
const USD_TABLE: ResolvedPayeTable = {
  id: "table-usd",
  label: "Monthly USD PAYE",
  currency: "USD",
  cycle: "MONTHLY",
  effectiveFrom: SEEDED_EFFECTIVE_FROM,
  bands: [
    { lowerBound: d("0"), upperBound: d("100"), ratePercent: d("0"), deductAmount: d("0") },
    { lowerBound: d("100.01"), upperBound: d("300"), ratePercent: d("20"), deductAmount: d("20") },
    { lowerBound: d("300.01"), upperBound: d("1000"), ratePercent: d("25"), deductAmount: d("35") },
    { lowerBound: d("1000.01"), upperBound: d("2000"), ratePercent: d("30"), deductAmount: d("85") },
    { lowerBound: d("2000.01"), upperBound: d("3000"), ratePercent: d("35"), deductAmount: d("185") },
    { lowerBound: d("3000.01"), upperBound: null, ratePercent: d("40"), deductAmount: d("335") },
  ],
};

describe("payeOn — the published subtract method", () => {
  it("taxes nothing in the zero band", () => {
    // 100 sits at the top of the 0% band. An employee on 100 pays no PAYE.
    expect(payeOn(100, USD_TABLE).tax.toString()).toBe("0");
  });

  it("taxes nothing on zero or negative gross", () => {
    // Reachable: pre-tax deductions can exceed a small gross. Must not produce
    // a negative tax, which would be a payment to the employee.
    expect(payeOn(0, USD_TABLE).tax.toString()).toBe("0");
    expect(payeOn(-50, USD_TABLE).tax.toString()).toBe("0");
  });

  it("worked example: 200 in the 20% band", () => {
    // 200 × 20% − 20 = 20
    expect(payeOn(200, USD_TABLE).tax.toString()).toBe("20");
  });

  it("worked example: 500 in the 25% band", () => {
    // 500 × 25% − 35 = 90
    expect(payeOn(500, USD_TABLE).tax.toString()).toBe("90");
  });

  it("worked example: 1500 in the 30% band", () => {
    // 1500 × 30% − 85 = 365
    expect(payeOn(1500, USD_TABLE).tax.toString()).toBe("365");
  });

  it("worked example: 5000 in the open-ended top band", () => {
    // 5000 × 40% − 335 = 1665
    expect(payeOn(5000, USD_TABLE).tax.toString()).toBe("1665");
  });

  it("is continuous across a band boundary", () => {
    // The whole point of the deduction column. A cent more gross must not cost
    // meaningfully more tax — if it does, the table was transcribed wrong.
    const below = payeOn(300, USD_TABLE).tax;
    const above = payeOn("300.01", USD_TABLE).tax;
    expect(above.minus(below).abs().lessThan(d("0.05"))).toBe(true);
  });

  it("picks the band by inclusive bounds, not by rounding", () => {
    expect(payeOn("100.01", USD_TABLE).band?.ratePercent.toString()).toBe("20");
    expect(payeOn(100, USD_TABLE).band?.ratePercent.toString()).toBe("0");
  });

  it("falls back to the highest band when a table has no open top", () => {
    // A truncated table. Taxing at zero above the last ceiling would be the
    // wrong answer for a high earner, so the top band is used.
    const truncated: ResolvedPayeTable = {
      ...USD_TABLE,
      bands: USD_TABLE.bands.slice(0, 2).map((band, index) =>
        index === 1 ? { ...band, upperBound: d("300") } : band,
      ),
    };
    expect(payeOn(9000, truncated).band?.ratePercent.toString()).toBe("20");
  });

  it("never returns a negative tax even from an inverted table", () => {
    // A mistranscribed deduction larger than the tax. Clamped, because a
    // negative PAYE would be remitted as a refund nobody authorised.
    const broken: ResolvedPayeTable = {
      ...USD_TABLE,
      bands: [
        { lowerBound: d("0"), upperBound: null, ratePercent: d("20"), deductAmount: d("9999") },
      ],
    };
    expect(payeOn(500, broken).tax.toString()).toBe("0");
  });

  it("rounds to the cent, half away from zero", () => {
    // 333.33 × 25% = 83.3325 → 83.33, then − 35 = 48.33
    expect(payeOn("333.33", USD_TABLE).tax.toString()).toBe("48.33");
  });
});

describe("contributionOn — the ceiling applies to the base, not the result", () => {
  const nssa = {
    ratePercent: d("4.5"),
    ceilingAmount: d("700"),
    floorAmount: null,
  };

  it("charges the full rate below the ceiling", () => {
    // 500 × 4.5% = 22.50
    expect(contributionOn(500, nssa).amount.toString()).toBe("22.5");
  });

  it("caps the base, giving 31.50 rather than 225 on 5000 earnings", () => {
    // This is the mistake the helper exists to prevent. 4.5% of 5000 capped at
    // 700 would be 225 — nine times what NSSA actually collects. 4.5% of a base
    // capped at 700 is 31.50.
    const result = contributionOn(5000, nssa);
    expect(result.basis.toString()).toBe("700");
    expect(result.amount.toString()).toBe("31.5");
  });

  it("charges exactly at the ceiling", () => {
    expect(contributionOn(700, nssa).amount.toString()).toBe("31.5");
  });

  it("applies a floor before the ceiling", () => {
    const floored = { ratePercent: d("10"), ceilingAmount: d("700"), floorAmount: d("200") };
    expect(contributionOn(50, floored).basis.toString()).toBe("200");
    expect(contributionOn(50, floored).amount.toString()).toBe("20");
  });

  it("treats negative earnings as zero", () => {
    expect(contributionOn(-100, nssa).amount.toString()).toBe("0");
  });

  it("is uncapped when no ceiling is set", () => {
    const zimdef = { ratePercent: d("1"), ceilingAmount: null, floorAmount: null };
    expect(contributionOn(5000, zimdef).amount.toString()).toBe("50");
  });
});

describe("creditValue", () => {
  it("is worth its flat amount for the elderly credit", () => {
    expect(
      creditValue({ key: "ELDERLY", amount: d("75"), ratePercent: null }).toString(),
    ).toBe("75");
  });

  it("is a share of what the employee contributed for medical aid", () => {
    // 50% of a 120 contribution is 60.
    expect(
      creditValue({ key: "MEDICAL_AID", amount: null, ratePercent: d("50") }, 120).toString(),
    ).toBe("60");
  });

  it("is worth nothing to somebody who contributed nothing", () => {
    expect(
      creditValue({ key: "MEDICAL_AID", amount: null, ratePercent: d("50") }, 0).toString(),
    ).toBe("0");
  });
});

describe("necDues", () => {
  it("takes a percentage when one is set", () => {
    expect(necDues(1000, { ratePercent: d("0.5"), fixedAmount: null }).toString()).toBe("5");
  });

  it("prefers the percentage over a fixed amount when both are present", () => {
    // A council sets one or the other; if a row somehow has both, the rate is
    // the more specific answer.
    expect(
      necDues(1000, { ratePercent: d("0.5"), fixedAmount: d("99") }).toString(),
    ).toBe("5");
  });

  it("falls back to the fixed amount", () => {
    expect(necDues(1000, { ratePercent: null, fixedAmount: d("3") }).toString()).toBe("3");
  });

  it("is zero when a council has neither", () => {
    expect(necDues(1000, { ratePercent: null, fixedAmount: null }).toString()).toBe("0");
  });
});

describe("periodLabel", () => {
  it("names the month a refusal is about", () => {
    expect(periodLabel(new Date("2026-08-15T00:00:00.000Z"))).toBe("August 2026");
  });
});

describe("resolving tables against a real company", () => {
  let companyId: string;

  beforeAll(async () => {
    const stamp = Date.now();
    const company = await prisma.company.create({
      data: { name: `Statutory tables ${stamp}`, slug: `statutory-tables-${stamp}` },
      select: { id: true },
    });
    companyId = company.id;
    await seedZimbabweStatutoryPack({ companyId });
  });

  afterAll(async () => {
    if (!companyId) return;
    await prisma.payeTable.deleteMany({ where: { companyId } });
    await prisma.statutoryRate.deleteMany({ where: { companyId } });
    await prisma.taxCredit.deleteMany({ where: { companyId } });
    await prisma.necAgreement.deleteMany({ where: { companyId } });
    await prisma.company.deleteMany({ where: { id: companyId } });
  });

  const august = new Date("2026-08-31T00:00:00.000Z");

  it("finds the seeded USD table for a covered period", async () => {
    const table = await resolvePayeTable({ companyId, currency: "USD", on: august });
    expect(table.currency).toBe("USD");
    expect(table.bands.length).toBe(6);
    // Bands come back in order, so `payeOn` can walk them.
    expect(table.bands[0].lowerBound.toString()).toBe("0");
    expect(table.bands[5].upperBound).toBeNull();
  });

  it("finds the seeded ZWG table separately — the two are not pooled", async () => {
    const zwg = await resolvePayeTable({ companyId, currency: "ZWG", on: august });
    expect(zwg.currency).toBe("ZWG");
    // The ZWG zero band is far above the USD one, which is the entire reason
    // earnings are taxed on their own currency's table rather than converted.
    expect(zwg.bands[0].upperBound?.toString()).toBe("2800");
  });

  it("REFUSES for a period before any table starts", async () => {
    // The behaviour the design exists for. December 2025 predates the seed, so
    // there is no table — and the answer is an error, not the 2026 table.
    await expect(
      resolvePayeTable({
        companyId,
        currency: "USD",
        on: new Date("2025-12-01T00:00:00.000Z"),
      }),
    ).rejects.toThrow(MissingStatutoryTableError);
  });

  it("names the month and currency in the refusal", async () => {
    await expect(
      resolvePayeTable({
        companyId,
        currency: "ZAR",
        on: august,
      }),
    ).rejects.toThrow("No PAYE table covers August 2026 for ZAR");
  });

  it("refuses when a table exists but has no bands", async () => {
    // An empty table would tax everybody at zero — the same silent wrong number
    // by a different route, so it is refused too.
    const empty = await prisma.payeTable.create({
      data: {
        companyId,
        currency: "GBP",
        label: "Empty",
        effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
      },
      select: { id: true },
    });
    await expect(
      resolvePayeTable({ companyId, currency: "GBP", on: august }),
    ).rejects.toThrow(/has none/);
    await prisma.payeTable.delete({ where: { id: empty.id } });
  });

  it("stops using a table once it has expired", async () => {
    const expiring = await prisma.payeTable.create({
      data: {
        companyId,
        currency: "EUR",
        label: "Expired",
        effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
        effectiveTo: new Date("2026-06-30T23:59:59.999Z"),
        bands: {
          create: [
            { lowerBound: "0", upperBound: null, ratePercent: "10", deductAmount: "0" },
          ],
        },
      },
      select: { id: true },
    });

    // Covered in May, gone by August.
    const may = await resolvePayeTable({
      companyId,
      currency: "EUR",
      on: new Date("2026-05-15T00:00:00.000Z"),
    });
    expect(may.label).toBe("Expired");

    await expect(
      resolvePayeTable({ companyId, currency: "EUR", on: august }),
    ).rejects.toThrow(MissingStatutoryTableError);

    await prisma.payeTable.delete({ where: { id: expiring.id } });
  });

  it("takes the newest table when two windows overlap", async () => {
    const newer = await prisma.payeTable.create({
      data: {
        companyId,
        currency: "USD",
        label: "Mid-year USD revision",
        effectiveFrom: new Date("2026-07-01T00:00:00.000Z"),
        bands: {
          create: [
            { lowerBound: "0", upperBound: null, ratePercent: "15", deductAmount: "0" },
          ],
        },
      },
      select: { id: true },
    });

    const table = await resolvePayeTable({ companyId, currency: "USD", on: august });
    expect(table.label).toBe("Mid-year USD revision");

    // And the earlier one still governs an earlier period — which is why last
    // month's payroll does not recompute on this month's numbers.
    const march = await resolvePayeTable({
      companyId,
      currency: "USD",
      on: new Date("2026-03-31T00:00:00.000Z"),
    });
    expect(march.label).toBe("Monthly USD PAYE (seeded starting set)");

    await prisma.payeTable.delete({ where: { id: newer.id } });
  });

  it("prefers a currency-specific rate over a currency-agnostic one", async () => {
    // The NSSA ceiling is denominated; the AIDS levy is not.
    const nssa = await resolveStatutoryRate({
      companyId,
      key: "NSSA_POBS_EMPLOYEE",
      currency: "ZWG",
      on: august,
    });
    expect(nssa?.currency).toBe("ZWG");
    expect(nssa?.ceilingAmount?.toString()).toBe("19600");

    const aids = await resolveStatutoryRate({ companyId, key: "AIDS_LEVY", on: august });
    expect(aids?.currency).toBeNull();
    expect(aids?.ratePercent.toString()).toBe("3");
  });

  it("returns null for an optional rate that is not on file", async () => {
    await prisma.statutoryRate.deleteMany({
      where: { companyId, key: "STANDARDS_DEVELOPMENT_LEVY" },
    });
    expect(
      await resolveStatutoryRate({
        companyId,
        key: "STANDARDS_DEVELOPMENT_LEVY",
        on: august,
      }),
    ).toBeNull();
  });

  it("throws for a rate the caller has declared mandatory", async () => {
    await expect(
      requireStatutoryRate({
        companyId,
        key: "STANDARDS_DEVELOPMENT_LEVY",
        on: august,
      }),
    ).rejects.toThrow("No STANDARDS_DEVELOPMENT_LEVY rate covers August 2026");
  });

  it("resolves one credit per key even when windows overlap", async () => {
    const credits = await resolveTaxCredits({ companyId, currency: "USD", on: august });
    const keys = credits.map((credit) => credit.key).sort();
    expect(keys).toEqual(["DISABILITY", "ELDERLY", "MEDICAL_AID"]);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("has no NEC agreement until a company enters one", async () => {
    // Deliberately unseeded: dues are per council and there are dozens.
    expect(
      await resolveNecAgreement({ companyId, currency: "USD", on: august }),
    ).toBeNull();
  });

  it("lists every statutory gap at once, not one per failed run", async () => {
    const gaps = await findStatutoryGaps({
      companyId,
      currencies: ["USD", "ZAR"],
      on: august,
    });
    // ZAR has neither a table nor an NSSA rate; USD has both.
    expect(gaps).toContain("No PAYE table covers August 2026 for ZAR");
    expect(gaps).toContain("No NSSA employee rate covers August 2026 for ZAR");
    expect(gaps.some((gap) => gap.includes("for USD"))).toBe(false);
  });
});

describe("seeding is idempotent and never reverts a correction", () => {
  let companyId: string;

  beforeAll(async () => {
    const stamp = Date.now();
    const company = await prisma.company.create({
      data: { name: `Statutory seed ${stamp}`, slug: `statutory-seed-${stamp}` },
      select: { id: true },
    });
    companyId = company.id;
  });

  afterAll(async () => {
    if (!companyId) return;
    await prisma.payeTable.deleteMany({ where: { companyId } });
    await prisma.statutoryRate.deleteMany({ where: { companyId } });
    await prisma.taxCredit.deleteMany({ where: { companyId } });
    await prisma.company.deleteMany({ where: { id: companyId } });
  });

  it("writes the pack once and skips a second run", async () => {
    const first = await seedZimbabweStatutoryPack({ companyId });
    expect(first.skipped).toBe(false);
    expect(first.payeTablesCreated).toBe(2);
    expect(first.ratesCreated).toBeGreaterThan(0);
    expect(first.creditsCreated).toBeGreaterThan(0);

    const second = await seedZimbabweStatutoryPack({ companyId });
    expect(second.skipped).toBe(true);
    expect(second.payeTablesCreated).toBe(0);

    // Still exactly two tables, not four.
    expect(await prisma.payeTable.count({ where: { companyId } })).toBe(2);
  });

  it("marks every seeded row so an operator can tell them from their own", async () => {
    const seeded = await prisma.payeTable.count({
      where: { companyId, isSeeded: true },
    });
    expect(seeded).toBe(2);
    const unseeded = await prisma.statutoryRate.count({
      where: { companyId, isSeeded: false },
    });
    expect(unseeded).toBe(0);
  });

  it("leaves a corrected rate alone on a re-seed", async () => {
    // The failure mode this guards: an accountant fixes the APWCS rate for
    // their industry, provisioning re-runs, and the payroll quietly goes back
    // to being wrong.
    await prisma.statutoryRate.create({
      data: {
        companyId,
        key: "NSSA_APWCS",
        currency: null,
        ratePercent: "2.75",
        effectiveFrom: new Date("2026-08-01T00:00:00.000Z"),
        source: "Entered by our accountant — mining risk class",
      },
    });

    await seedZimbabweStatutoryPack({ companyId });

    const resolved = await resolveStatutoryRate({
      companyId,
      key: "NSSA_APWCS",
      on: new Date("2026-08-31T00:00:00.000Z"),
    });
    expect(resolved?.ratePercent.toString()).toBe("2.75");
  });
});
