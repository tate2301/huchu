/**
 * Migration witness for `20261008030000_retail_bundles` (PRD-08, 20-products §3.3).
 *
 * Bundles and buy-more deals, their items, and the sale line's link to the
 * bundle it was sold under. Read off the database.
 */

import { describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

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

describe("bundles, as stored", () => {
  it("adds the kind and on-sale enums", async () => {
    expect(await enumLabels("RetailBundleKind")).toEqual(["FIXED_SET", "BUY_MORE"]);
    expect(await enumLabels("RetailOnSaleDays")).toEqual(["EVERY_DAY", "WEEKENDS", "CHOOSE"]);
  });

  it("creates the bundle table", async () => {
    expect(await column("RetailBundle", "code")).toMatchObject({ type: "text", nullable: false });
    expect(await column("RetailBundle", "kind")).toMatchObject({ type: "RetailBundleKind", nullable: false });
    expect(await column("RetailBundle", "barcode")).toMatchObject({ type: "text", nullable: true });
    expect(await column("RetailBundle", "price")).toMatchObject({ type: "numeric", nullable: false });
    expect(await column("RetailBundle", "buyQuantity")).toMatchObject({ type: "int4", nullable: true });
    expect(await column("RetailBundle", "days")).toMatchObject({
      type: "RetailOnSaleDays",
      nullable: false,
      fallback: "'EVERY_DAY'::\"RetailOnSaleDays\"",
    });
    expect(await column("RetailBundle", "daysOfWeek")).toMatchObject({ type: "_int4", fallback: "ARRAY[]::integer[]" });
    expect(await column("RetailBundle", "endsOn")).toMatchObject({ type: "date", nullable: true });
    expect(await column("RetailBundle", "tillButton")).toMatchObject({ type: "bool", nullable: false, fallback: "true" });
    for (const name of ["pausedAt", "stoppedAt", "archivedAt"]) {
      expect(await column("RetailBundle", name)).toMatchObject({ type: "timestamp", nullable: true });
    }
  });

  it("keys a bundle's code per company and indexes barcode and the live ones", async () => {
    expect(await indexDef("RetailBundle_companyId_code_key")).toContain(`UNIQUE INDEX`);
    expect(await indexDef("RetailBundle_companyId_code_key")).toContain(`("companyId", code)`);
    expect(await indexDef("RetailBundle_companyId_barcode_idx")).toContain(`("companyId", barcode)`);
    expect(await indexDef("RetailBundle_companyId_archivedAt_stoppedAt_idx")).toContain(`("companyId", "archivedAt", "stoppedAt")`);
  });

  it("creates the items, one row per product in a bundle", async () => {
    expect(await column("RetailBundleItem", "quantity")).toMatchObject({ type: "int4", nullable: false, fallback: "1" });
    expect(await column("RetailBundleItem", "sortOrder")).toMatchObject({ type: "int4", nullable: false, fallback: "0" });
    expect(await indexDef("RetailBundleItem_bundleId_productId_key")).toContain(`UNIQUE INDEX`);
    expect(await indexDef("RetailBundleItem_productId_idx")).toContain(`("productId")`);
    expect(await foreignKey("RetailBundleItem_bundleId_fkey")).toEqual({ rule: "CASCADE", target: "RetailBundle" });
    expect(await foreignKey("RetailBundleItem_productId_fkey")).toEqual({ rule: "RESTRICT", target: "Product" });
  });

  it("links a bundle to its category, site and maker, and lets each go", async () => {
    expect(await foreignKey("RetailBundle_companyId_fkey")).toEqual({ rule: "CASCADE", target: "Company" });
    expect(await foreignKey("RetailBundle_categoryId_fkey")).toEqual({ rule: "SET NULL", target: "RetailCategory" });
    expect(await foreignKey("RetailBundle_siteId_fkey")).toEqual({ rule: "SET NULL", target: "Site" });
    expect(await foreignKey("RetailBundle_createdById_fkey")).toEqual({ rule: "SET NULL", target: "User" });
  });

  it("gives a sale line its bundle and the ref its group shares", async () => {
    expect(await column("RetailSaleLine", "bundleId")).toMatchObject({ type: "text", nullable: true });
    expect(await column("RetailSaleLine", "bundleRef")).toMatchObject({ type: "text", nullable: true });
    expect(await indexDef("RetailSaleLine_companyId_bundleId_idx")).toContain(`("companyId", "bundleId")`);
    expect(await foreignKey("RetailSaleLine_bundleId_fkey")).toEqual({ rule: "SET NULL", target: "RetailBundle" });
  });
});
