/**
 * Migration witness for `catalogue_without_prices`.
 *
 * A workspace pays per vertical, so plans, bundles and features carry no price,
 * and no feature is "billable" any more: one that was starts off by default.
 */

import { describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

async function columns(table: string) {
  const rows = await prisma.$queryRaw<Array<{ name: string }>>`
    SELECT column_name AS name FROM information_schema.columns WHERE table_name = ${table}`;
  return rows.map((row) => row.name);
}

describe("a catalogue without prices", () => {
  it("has no price on a plan", async () => {
    const cols = await columns("SubscriptionPlan");
    expect(cols).toContain("graceDays");
    expect(cols).not.toContain("monthlyPrice");
    expect(cols).not.toContain("annualPrice");
  });

  it("has no price on a bundle", async () => {
    const cols = await columns("FeatureBundle");
    expect(cols).toContain("code");
    expect(cols).not.toContain("monthlyPrice");
    expect(cols).not.toContain("additionalSiteMonthlyPrice");
  });

  it("has no price and no billable mark on a feature", async () => {
    const cols = await columns("PlatformFeature");
    expect(cols).toContain("defaultEnabled");
    expect(cols).not.toContain("monthlyPrice");
    expect(cols).not.toContain("isBillable");
  });
});
