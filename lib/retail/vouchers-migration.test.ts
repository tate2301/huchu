/**
 * Migration witness for `20261009010000_retail_vouchers` (PRD-10, 20-products §3.3).
 *
 * Vouchers and their uses, the secret lockout, the sale's vouchers sold and
 * discount voucher, the payment's voucher, the posting roles and sources, and
 * the VOUCHER tender's move from 1018 to 2250. Read off the database.
 */

import { afterAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { destroyProvisionedTenant } from "@/lib/platform/tenant-teardown";
import { makeTestShop } from "@/lib/retail/products/test-fixtures";

async function enumLabels(name: string): Promise<string[]> {
  const rows = await prisma.$queryRaw<Array<{ label: string }>>`
    SELECT e.enumlabel AS label FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = ${name} ORDER BY e.enumsortorder`;
  return rows.map((row) => row.label);
}

async function column(table: string, name: string) {
  const [row] = await prisma.$queryRaw<Array<{ type: string; nullable: string; fallback: string | null }>>`
    SELECT udt_name AS type, is_nullable AS nullable, column_default AS fallback
    FROM information_schema.columns WHERE table_name = ${table} AND column_name = ${name}`;
  return row ? { type: row.type, nullable: row.nullable === "YES", fallback: row.fallback } : null;
}

async function indexDef(name: string) {
  const [row] = await prisma.$queryRaw<Array<{ def: string }>>`SELECT indexdef AS def FROM pg_indexes WHERE indexname = ${name}`;
  return row?.def ?? null;
}

async function foreignKey(constraint: string) {
  const [row] = await prisma.$queryRaw<Array<{ rule: string; target: string }>>`
    SELECT rc.delete_rule AS rule, ccu.table_name AS target
    FROM information_schema.referential_constraints rc
    JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = rc.unique_constraint_name
    WHERE rc.constraint_name = ${constraint}`;
  return row ?? null;
}

const made: string[] = [];
afterAll(async () => {
  for (const companyId of made) await destroyProvisionedTenant(companyId);
});

describe("vouchers, as stored", () => {
  it("adds the kind, funding and send-by enums", async () => {
    expect(await enumLabels("RetailVoucherKind")).toEqual(["GIFT", "CREDIT_NOTE", "DISCOUNT"]);
    expect(await enumLabels("RetailVoucherFunding")).toEqual(["SOLD", "GIVEN", "REFUND"]);
    expect(await enumLabels("RetailVoucherSendBy")).toEqual(["PRINT", "WHATSAPP", "BOTH"]);
  });

  it("creates the voucher table with its money, its uses left and its holder", async () => {
    expect(await column("RetailVoucher", "code")).toMatchObject({ type: "text", nullable: false });
    expect(await column("RetailVoucher", "secret")).toMatchObject({ type: "text", nullable: false });
    expect(await column("RetailVoucher", "kind")).toMatchObject({ type: "RetailVoucherKind", nullable: false });
    expect(await column("RetailVoucher", "funding")).toMatchObject({ type: "RetailVoucherFunding", nullable: false });
    expect(await column("RetailVoucher", "value")).toMatchObject({ type: "numeric", nullable: true });
    expect(await column("RetailVoucher", "balance")).toMatchObject({ type: "numeric", nullable: false, fallback: "0" });
    expect(await column("RetailVoucher", "percentOff")).toMatchObject({ type: "numeric", nullable: true });
    expect(await column("RetailVoucher", "amountOff")).toMatchObject({ type: "numeric", nullable: true });
    expect(await column("RetailVoucher", "copies")).toMatchObject({ type: "int4", nullable: false, fallback: "1" });
    expect(await column("RetailVoucher", "usesLeft")).toMatchObject({ type: "int4", nullable: true });
    expect(await column("RetailVoucher", "holderNote")).toMatchObject({ type: "text", nullable: true });
    expect(await column("RetailVoucher", "minSale")).toMatchObject({ type: "numeric", nullable: true });
    expect(await column("RetailVoucher", "expiresOn")).toMatchObject({ type: "date", nullable: false });
    expect(await column("RetailVoucher", "sendBy")).toMatchObject({
      type: "RetailVoucherSendBy",
      nullable: false,
      fallback: "'PRINT'::\"RetailVoucherSendBy\"",
    });
    for (const name of ["sentAt", "expiredAt", "voidedAt"]) {
      expect(await column("RetailVoucher", name)).toMatchObject({ type: "timestamp", nullable: true });
    }
    expect(await column("RetailVoucher", "voidReason")).toMatchObject({ type: "text", nullable: true });
  });

  it("keeps the secret lockout on the voucher", async () => {
    expect(await column("RetailVoucher", "wrongSecrets")).toMatchObject({ type: "int4", nullable: false, fallback: "0" });
    expect(await column("RetailVoucher", "wrongSince")).toMatchObject({ type: "timestamptz", nullable: true });
    expect(await column("RetailVoucher", "lockedUntil")).toMatchObject({ type: "timestamptz", nullable: true });
  });

  it("keys a code per company and indexes kind by expiry and the holder", async () => {
    expect(await indexDef("RetailVoucher_companyId_code_key")).toContain("UNIQUE INDEX");
    expect(await indexDef("RetailVoucher_companyId_code_key")).toContain(`("companyId", code)`);
    expect(await indexDef("RetailVoucher_companyId_kind_expiresOn_idx")).toContain(`("companyId", kind, "expiresOn")`);
    expect(await indexDef("RetailVoucher_customerId_idx")).toContain(`("customerId")`);
  });

  it("links a voucher to its customer, site, sale and people, and lets each go", async () => {
    expect(await foreignKey("RetailVoucher_companyId_fkey")).toEqual({ rule: "CASCADE", target: "Company" });
    expect(await foreignKey("RetailVoucher_customerId_fkey")).toEqual({ rule: "SET NULL", target: "Customer" });
    expect(await foreignKey("RetailVoucher_siteId_fkey")).toEqual({ rule: "SET NULL", target: "Site" });
    expect(await foreignKey("RetailVoucher_soldSaleId_fkey")).toEqual({ rule: "SET NULL", target: "RetailSale" });
    expect(await foreignKey("RetailVoucher_issuedById_fkey")).toEqual({ rule: "SET NULL", target: "User" });
    expect(await foreignKey("RetailVoucher_voidedById_fkey")).toEqual({ rule: "SET NULL", target: "User" });
  });

  it("creates the uses, held to their voucher and sale", async () => {
    expect(await column("RetailVoucherUse", "amount")).toMatchObject({ type: "numeric", nullable: false });
    expect(await column("RetailVoucherUse", "balanceAfter")).toMatchObject({ type: "numeric", nullable: false });
    expect(await indexDef("RetailVoucherUse_voucherId_createdAt_idx")).toContain(`("voucherId", "createdAt")`);
    expect(await indexDef("RetailVoucherUse_saleId_idx")).toContain(`("saleId")`);
    expect(await foreignKey("RetailVoucherUse_voucherId_fkey")).toEqual({ rule: "RESTRICT", target: "RetailVoucher" });
    expect(await foreignKey("RetailVoucherUse_saleId_fkey")).toEqual({ rule: "RESTRICT", target: "RetailSale" });
  });

  it("gives a sale its vouchers sold and discount voucher, and a payment its voucher", async () => {
    expect(await column("RetailSale", "vouchersSoldAmount")).toMatchObject({ type: "numeric", nullable: false, fallback: "0" });
    expect(await column("RetailSale", "discountVoucherId")).toMatchObject({ type: "text", nullable: true });
    expect(await column("RetailSalePayment", "voucherId")).toMatchObject({ type: "text", nullable: true });
    expect(await foreignKey("RetailSale_discountVoucherId_fkey")).toEqual({ rule: "SET NULL", target: "RetailVoucher" });
    expect(await foreignKey("RetailSalePayment_voucherId_fkey")).toEqual({ rule: "SET NULL", target: "RetailVoucher" });
  });

  it("adds the posting roles and sources", async () => {
    expect(await enumLabels("RetailAccountRole")).toEqual(expect.arrayContaining(["VOUCHERS_OWED", "PROMOTIONS_GIVEN", "OTHER_INCOME"]));
    expect(await enumLabels("AccountingSourceType")).toEqual(
      expect.arrayContaining(["RETAIL_VOUCHER_ISSUE", "RETAIL_VOUCHER_EXPIRY", "RETAIL_VOUCHER_VOID"]),
    );
  });

  it("moves a VOUCHER tender still on 1018 to 2250, as the migration's data step does", async () => {
    const shop = await makeTestShop("Voucher tender");
    made.push(shop.companyId);
    const account = (code: string, name: string) =>
      prisma.chartOfAccount.create({ data: { companyId: shop.companyId, code, name, type: code === "2250" ? "LIABILITY" : "ASSET" }, select: { id: true } });
    const clearing = await account("1018", "Voucher Clearing");
    const owed = await account("2250", "Vouchers issued");
    const mapping = await prisma.tenderAccountMapping.create({
      data: { companyId: shop.companyId, tenderType: "VOUCHER", clearingAccountId: clearing.id },
      select: { id: true },
    });
    const sql = (await import("node:fs")).readFileSync(
      `${process.cwd()}/prisma/migrations/20261009010000_retail_vouchers/migration.sql`,
      "utf8",
    );
    const update = sql.slice(sql.indexOf(`UPDATE "TenderAccountMapping"`));
    await prisma.$executeRawUnsafe(update);
    expect((await prisma.tenderAccountMapping.findUniqueOrThrow({ where: { id: mapping.id } })).clearingAccountId).toBe(owed.id);
  });
});
