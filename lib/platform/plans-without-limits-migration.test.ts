/**
 * Migration witness for `plans_without_limits`.
 *
 * A workspace pays per vertical, with no cap on sites, tills or members, so a
 * plan carries none of those limits any more.
 */

import { describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

async function columns(table: string) {
  const rows = await prisma.$queryRaw<Array<{ name: string }>>`
    SELECT column_name AS name FROM information_schema.columns WHERE table_name = ${table}`;
  return rows.map((row) => row.name);
}

describe("plans without limits", () => {
  it("has no site, member or till limit on a plan", async () => {
    const cols = await columns("SubscriptionPlan");
    expect(cols).toContain("graceDays");
    expect(cols).not.toContain("maxSites");
    expect(cols).not.toContain("maxUsers");
    expect(cols).not.toContain("maxTills");
  });
});
