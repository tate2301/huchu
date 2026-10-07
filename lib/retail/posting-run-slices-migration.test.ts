/**
 * Migration witness for `retail_posting_run_slices` (SET-09).
 *
 * A company posts one run at a time: a run keeps when it last counted an
 * event (`updatedAt`, so a quiet run reads as cut off) and the slice posting
 * it holds it until `sliceUntil`.
 */

import { describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

async function column(name: string) {
  const [facts] = await prisma.$queryRaw<Array<{ udt_name: string; is_nullable: string; column_default: string | null }>>`
    SELECT udt_name, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_name = 'RetailPostingRun' AND column_name = ${name}`;
  return facts;
}

describe("a posting run, one at a time", () => {
  it("keeps when the run last moved, set for every run", async () => {
    const facts = await column("updatedAt");
    expect(facts).toMatchObject({ udt_name: "timestamp", is_nullable: "NO" });
    expect(facts!.column_default).toContain("CURRENT_TIMESTAMP");
    const [row] = await prisma.$queryRaw<Array<{ missing: bigint }>>`
      SELECT COUNT(*) AS missing FROM "RetailPostingRun" WHERE "updatedAt" IS NULL`;
    expect(Number(row!.missing)).toBe(0);
  });

  it("holds a run for the slice posting it, and for nobody otherwise", async () => {
    expect(await column("sliceUntil")).toMatchObject({ udt_name: "timestamp", is_nullable: "YES", column_default: null });
  });
});
