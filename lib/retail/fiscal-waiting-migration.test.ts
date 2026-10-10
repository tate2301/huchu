/**
 * Migration witness for `retail_fiscal_waiting` (SET-08).
 *
 * A till sale rung while a fiscal day's report is on its way to ZIMRA waits,
 * marked with when it started waiting, for the next day it can be signed
 * into; the shop's waiting sales are found by company. A fiscal day carries
 * when the close that holds it took it, so one close holds a day at a time.
 * Both start empty: no sale waits and no close holds a day.
 */

import { describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

async function column(table: string, name: string) {
  const [row] = await prisma.$queryRaw<Array<{ type: string; nullable: string; fallback: string | null }>>`
    SELECT udt_name AS type, is_nullable AS nullable, column_default AS fallback
    FROM information_schema.columns WHERE table_name = ${table} AND column_name = ${name}`;
  return row ? { type: row.type, nullable: row.nullable === "YES", fallback: row.fallback } : null;
}

async function indexDefinition(name: string): Promise<string | null> {
  const [row] = await prisma.$queryRaw<Array<{ indexdef: string }>>`
    SELECT indexdef FROM pg_indexes WHERE indexname = ${name}`;
  return row?.indexdef ?? null;
}

describe("waiting sales and the close's hold, as stored", () => {
  it("marks a sale with when it started waiting for a day, empty by default", async () => {
    expect(await column("RetailSale", "fiscalWaitsSince")).toEqual({ type: "timestamp", nullable: true, fallback: null });
  });

  it("finds a shop's waiting sales by company", async () => {
    expect(await indexDefinition("RetailSale_companyId_fiscalWaitsSince_idx")).toMatch(
      /ON public\."RetailSale" USING btree \("companyId", "fiscalWaitsSince"\)/,
    );
  });

  it("keeps when the close that holds a day took it, empty by default", async () => {
    expect(await column("FiscalDay", "closingSince")).toEqual({ type: "timestamp", nullable: true, fallback: null });
  });
});
