/**
 * Migration witness for `fiscal_receipt_date` (SET-08).
 *
 * A fiscal receipt keeps the date it was signed with, apart from its sale's
 * own time: a till sale rung before the last receipt ZIMRA took is signed
 * with that receipt's date, and its `postedAt` stays when it was rung. Empty
 * by default; till receipts signed before the column were dated with their
 * sale's `postedAt` (its `createdAt` when it had none), and carry that date.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

const MIGRATION = join(process.cwd(), "prisma/migrations/20261006082500_fiscal_receipt_date/migration.sql");

async function column(table: string, name: string) {
  const [row] = await prisma.$queryRaw<Array<{ type: string; nullable: string; fallback: string | null }>>`
    SELECT udt_name AS type, is_nullable AS nullable, column_default AS fallback
    FROM information_schema.columns WHERE table_name = ${table} AND column_name = ${name}`;
  return row ? { type: row.type, nullable: row.nullable === "YES", fallback: row.fallback } : null;
}

/** Thrown to roll the backfill back once it has been looked at. */
class RolledBack extends Error {}

describe("a fiscal receipt's own date, as stored", () => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let companyId: string;
  let siteId: string;

  beforeAll(async () => {
    companyId = (await prisma.company.create({ data: { name: `Receipt Date ${stamp}`, slug: `receipt-date-${stamp}` } })).id;
    siteId = (await prisma.site.create({ data: { companyId, name: "Mbare", code: `RD-${stamp}` } })).id;
  });

  afterAll(async () => {
    await prisma.fiscalReceipt.deleteMany({ where: { companyId } });
    await prisma.retailSale.deleteMany({ where: { companyId } });
    await prisma.site.deleteMany({ where: { companyId } });
    await prisma.company.delete({ where: { id: companyId } });
  });

  it("keeps the date a receipt was signed with, empty by default", async () => {
    expect(await column("FiscalReceipt", "receiptDate")).toEqual({ type: "timestamp", nullable: true, fallback: null });
  });

  it("dates a till receipt signed before the column with its sale's time, and leaves an unsigned one empty", async () => {
    const rungAt = new Date("2026-10-01T08:15:00.000Z");
    const sale = (n: number, postedAt: Date | null) =>
      prisma.retailSale.create({
        data: { companyId, siteId, saleNo: `RD-${stamp}-${n}`, status: "POSTED", postedAt, subtotal: 1, totalAmount: 1 },
      });
    const [posted, unposted, unsigned] = [await sale(1, rungAt), await sale(2, null), await sale(3, rungAt)];
    const receipt = (saleId: string, receiptHash: string | null) =>
      prisma.fiscalReceipt.create({ data: { companyId, retailSaleId: saleId, receiptHash }, select: { id: true } });
    const rows = [await receipt(posted.id, "h1"), await receipt(unposted.id, "h2"), await receipt(unsigned.id, null)];

    const backfill = readFileSync(MIGRATION, "utf8").split(/;\s*\n/).find((statement) => /^\s*(--.*\n)*\s*UPDATE/m.test(statement))!;
    let dates: Array<Date | null> = [];
    await expect(
      prisma.$transaction(async (tx) => {
        await tx.fiscalReceipt.updateMany({ where: { id: { in: rows.map((row) => row.id) } }, data: { receiptDate: null } });
        await tx.$executeRawUnsafe(backfill);
        const after = await tx.fiscalReceipt.findMany({ where: { id: { in: rows.map((row) => row.id) } }, select: { id: true, receiptDate: true } });
        dates = rows.map((row) => after.find((each) => each.id === row.id)!.receiptDate);
        throw new RolledBack();
      }),
    ).rejects.toBeInstanceOf(RolledBack);
    expect(dates).toEqual([rungAt, unposted.createdAt, null]);
  });
});
