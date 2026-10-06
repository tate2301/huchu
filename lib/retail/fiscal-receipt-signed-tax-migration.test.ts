/**
 * Migration witness for `fiscal_receipt_signed_tax` (SET-08).
 *
 * A till receipt keeps the tax it was signed with — each sale line's rate and
 * the receipt's lines per ZIMRA taxID — so a resend and the day's Z-report
 * never re-read the catalogue. Empty by default; nothing is back-filled.
 */

import { describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

describe("a fiscal receipt's signed tax, as stored", () => {
  it("keeps the tax a receipt was signed with, empty by default", async () => {
    const [row] = await prisma.$queryRaw<Array<{ type: string; nullable: string; fallback: string | null }>>`
      SELECT udt_name AS type, is_nullable AS nullable, column_default AS fallback
      FROM information_schema.columns WHERE table_name = 'FiscalReceipt' AND column_name = 'signedTax'`;
    expect(row).toEqual({ type: "jsonb", nullable: "YES", fallback: null });
  });
});
