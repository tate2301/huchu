/**
 * Migration witness for `20261007120000_retail_shift_floor` (FLR-03).
 *
 * A shift keeps the ZiG counted into its drawer and the float its close left
 * for the next opening; a cash movement names the manager who approved it, and
 * lets go of them if their account is removed; the books have a source for
 * cash to or from the safe and for petty cash, and a shift can be what a
 * notification is about.
 */
import { describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

type ColumnFacts = {
  column_name: string;
  data_type: string;
  is_nullable: string;
  column_default: string | null;
  numeric_precision: number | null;
  numeric_scale: number | null;
};

async function columns(table: string) {
  const rows = await prisma.$queryRaw<ColumnFacts[]>`
    SELECT column_name, data_type, is_nullable, column_default, numeric_precision, numeric_scale
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = ${table}`;
  return new Map(rows.map((row) => [row.column_name, row]));
}

async function enumValues(name: string) {
  const rows = await prisma.$queryRaw<Array<{ value: string }>>`
    SELECT e.enumlabel AS value FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = ${name}`;
  return rows.map((row) => row.value);
}

describe("a shift's floats and a cash movement's approver, as stored", () => {
  it("keeps the ZiG float, zero by default, and the float a close left, empty until a close writes it", async () => {
    const facts = await columns("RetailShift");
    expect(facts.get("openingFloatZig")).toMatchObject({
      data_type: "numeric",
      numeric_precision: 14,
      numeric_scale: 2,
      is_nullable: "NO",
    });
    expect(facts.get("openingFloatZig")?.column_default).toMatch(/^0/);
    expect(facts.get("floatLeft")).toMatchObject({ data_type: "numeric", numeric_precision: 14, numeric_scale: 2, is_nullable: "YES" });
  });

  it("names who approved a movement and lets go of them when they are removed", async () => {
    const facts = await columns("RetailCashMovement");
    for (const name of ["approvedById", "approvedByName"]) {
      expect(facts.get(name), name).toMatchObject({ data_type: "text", is_nullable: "YES" });
    }
    const [row] = await prisma.$queryRaw<Array<{ def: string }>>`
      SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname = 'RetailCashMovement_approvedById_fkey'`;
    expect(row?.def).toMatch(/REFERENCES "User"\(id\) ON UPDATE CASCADE ON DELETE SET NULL/);
  });

  it("has a books source for cash to the safe and petty cash, and a shift as a notification's subject", async () => {
    expect(await enumValues("AccountingSourceType")).toEqual(expect.arrayContaining(["RETAIL_CASH_MOVEMENT", "RETAIL_PETTY_CASH"]));
    expect(await enumValues("NotificationEntityType")).toContain("RETAIL_SHIFT");
  });
});
