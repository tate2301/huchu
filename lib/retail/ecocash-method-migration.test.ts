/**
 * Migration witness for `20261006150000_retail_ecocash_method`.
 *
 * A shop says how customers pay it by EcoCash — its merchant code, its EcoCash
 * number or a terminal — and keeps the number; shops before it paid by merchant code.
 */

import { describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

describe("how a shop takes EcoCash, as stored", () => {
  it("is one of three ways", async () => {
    const values = await prisma.$queryRaw<Array<{ value: string }>>`
      SELECT e.enumlabel AS value
      FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'RetailEcocashMethod'
      ORDER BY e.enumsortorder`;
    expect(values.map((row) => row.value)).toEqual(["MERCHANT_CODE", "PHONE_NUMBER", "TERMINAL"]);
  });

  it("is never empty, by merchant code unless set, and keeps an optional number", async () => {
    const columns = await prisma.$queryRaw<
      Array<{ name: string; type: string; nullable: string; default: string | null }>
    >`
      SELECT column_name AS name, udt_name AS type, is_nullable AS nullable, column_default AS default
      FROM information_schema.columns
      WHERE table_name = 'RetailPaymentSettings' AND column_name IN ('ecocashMethod', 'ecocashPhone')
      ORDER BY column_name`;
    expect(columns).toEqual([
      { name: "ecocashMethod", type: "RetailEcocashMethod", nullable: "NO", default: `'MERCHANT_CODE'::"RetailEcocashMethod"` },
      { name: "ecocashPhone", type: "text", nullable: "YES", default: null },
    ]);
  });
});
