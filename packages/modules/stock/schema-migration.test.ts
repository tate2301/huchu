/**
 * Migration witness for S-1 — core pricing becomes `Decimal`, and `Product` /
 * `PriceList` gain what a shelf price needs.
 *
 * The sibling of `lib/retail/schema-migration.test.ts`, which witnessed R-1.1 for
 * the 29 retail columns. This one witnesses the same conversion on the core
 * columns retail is about to depend on, plus the additive half of the ticket.
 *
 * Why it exists: `docs/retail/retail-stock-consolidation-plan-2026-08-13.md` §1.4.
 * Retail resolves its shelf price out of core `Product` / `ProductPrice` from S-3
 * onward. Doing that while those columns are still `double precision` would route
 * every number R-1.1 made exact back through a float and undo R-1.1 without
 * anybody editing a retail file.
 *
 * These assert the **database catalogue** — `information_schema.columns`,
 * `pg_enum`, `pg_indexes` — and never the schema file. A green `prisma validate`
 * says the schema file parses; it is not evidence the database changed, and
 * `prisma db push` cannot cast a float column to `numeric` or add an enum label
 * at all. The scripts that did the work are `scripts/inventory-money-decimal.ts`,
 * `scripts/inventory-quantity-decimal.ts` and
 * `scripts/retail-price-engine-schema.ts`.
 *
 * ## All eleven, in two passes
 *
 * §1.4 named eleven `Float` columns. The six *pricing* ones converted first and
 * the five *quantity* ones were deferred, with the reason recorded here: they
 * are read by 38 files across four modules and the cascade was not worth taking
 * days before a Harare bottle store traded on this for a day.
 *
 * The deferral was a named ticket and this is the other half of it. All eleven
 * are asserted below, and the split is kept — two lists, two describes —
 * because the scales differ and so does the reason for each.
 */

import { describe, expect, it } from "vitest";
import { prisma } from "@corelithzw/db/client";

/**
 * The six converted columns, with the scale each must carry.
 *
 * Three scales, matching `lib/money.ts`: amounts at the cent, quantities at four
 * places so a volume break can start at a fraction, and tax and discount rates as
 * percentages rather than money.
 */
const PRICING_COLUMNS: Array<[table: string, column: string, precision: number, scale: number]> = [
  ["Product", "standardPrice", 14, 2],
  ["Product", "costPrice", 14, 2],
  ["Product", "defaultTaxRate", 5, 2],
  ["Product", "maxDiscountPercent", 5, 2],
  ["ProductPrice", "unitPrice", 14, 2],
  ["ProductPrice", "minQuantity", 12, 4],
];

/** Which of those may be null, because a nullable money column is a different claim. */
const NULLABLE_PRICING = new Set(["Product.costPrice", "Product.maxDiscountPercent"]);

/**
 * The additive half: the columns the price engine needs, with the type and the
 * nullability each must have.
 */
const NEW_COLUMNS: Array<[table: string, column: string, dataType: string, nullable: boolean]> = [
  ["PriceList", "taxInclusive", "boolean", false],
  ["Product", "barcode", "text", true],
  ["Product", "ageRestricted", "boolean", false],
  ["Product", "returnable", "boolean", false],
  ["Product", "depositAmount", "numeric", true],
];

type ColumnFacts = {
  data_type: string;
  numeric_precision: number | null;
  numeric_scale: number | null;
  is_nullable: string;
  column_default: string | null;
};

async function columnFacts(table: string, column: string) {
  const rows = await prisma.$queryRaw<ColumnFacts[]>`
    SELECT data_type, numeric_precision, numeric_scale, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_name = ${table} AND column_name = ${column}
  `;
  return rows[0] ?? null;
}

async function enumLabels(type: string) {
  const rows = await prisma.$queryRaw<Array<{ enumlabel: string }>>`
    SELECT e.enumlabel FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = ${type}
    ORDER BY e.enumsortorder
  `;
  return rows.map((row) => row.enumlabel);
}

/**
 * The five deferred columns, converted by `scripts/inventory-quantity-decimal.ts`.
 *
 * Four are quantities at `numeric(12,4)`. `unitCost` is **money** at
 * `numeric(14,2)`, and that difference is the reason the ticket mattered: it is
 * what a goods receipt writes, what `RetailSaleLine.costUnit` is copied from,
 * and therefore what every margin figure retail reports is computed against.
 */
const QUANTITY_COLUMNS: Array<[table: string, column: string, precision: number, scale: number]> = [
  ["InventoryItem", "currentStock", 12, 4],
  ["InventoryItem", "minStock", 12, 4],
  ["InventoryItem", "maxStock", 12, 4],
  ["InventoryItem", "unitCost", 14, 2],
  ["StockMovement", "quantity", 12, 4],
];

describe("core quantity columns are numeric at the right scale", () => {
  it("has a column to check for every entry", () => {
    // A silent zero here would make every assertion below vacuously true.
    expect(QUANTITY_COLUMNS.length).toBe(5);
  });

  it.each(QUANTITY_COLUMNS)(
    '"%s"."%s" is numeric(%i,%i)',
    async (table, column, precision, scale) => {
      const facts = await columnFacts(table, column);
      expect(facts, `${table}.${column} does not exist`).not.toBeNull();
      expect(facts?.data_type).toBe("numeric");
      expect(facts?.numeric_precision).toBe(precision);
      expect(facts?.numeric_scale).toBe(scale);
    },
  );

  /**
   * On-hand is the one that must not be nullable. "No stock" is zero; a null
   * would be "nobody has said", and every consumer would have to pick a meaning
   * for it. The other three are genuinely optional — an item with no minimum
   * has no minimum, and an item with no cost recorded did not cost nothing.
   */
  it("keeps on-hand not-null and defaulted to zero", async () => {
    const facts = await columnFacts("InventoryItem", "currentStock");
    expect(facts?.is_nullable).toBe("NO");
    expect(Number(facts?.column_default?.replace(/::.*$/, ""))).toBe(0);
  });

  it.each([
    ["minStock"],
    ["maxStock"],
    ["unitCost"],
  ])('"InventoryItem"."%s" stays nullable', async (column) => {
    expect((await columnFacts("InventoryItem", column))?.is_nullable).toBe("YES");
  });
});

describe("core pricing columns are numeric at the right scale", () => {
  it("has a column to check for every entry", () => {
    // A silent zero here would make every assertion below vacuously true.
    expect(PRICING_COLUMNS.length).toBe(6);
  });

  it.each(PRICING_COLUMNS)(
    '"%s"."%s" is numeric(%i,%i)',
    async (table, column, precision, scale) => {
      const facts = await columnFacts(table, column);
      expect(facts, `no such column "${table}"."${column}"`).not.toBeNull();
      expect(facts?.data_type).toBe("numeric");
      expect(facts?.numeric_precision).toBe(precision);
      expect(facts?.numeric_scale).toBe(scale);
    },
  );

  it.each(PRICING_COLUMNS)('"%s"."%s" keeps the nullability it had', async (table, column) => {
    const facts = await columnFacts(table, column);
    const expected = NULLABLE_PRICING.has(`${table}.${column}`) ? "YES" : "NO";
    expect(facts?.is_nullable).toBe(expected);
  });

  /**
   * The default survives the cast. `ALTER COLUMN … TYPE` will not cast a column
   * out from under a default it cannot also cast, so the migration drops it and
   * puts it back — and a migration that put back the *wrong* default would be
   * invisible until a row was inserted without the column. `minQuantity`
   * defaults to 1: a volume break silently starting at 0 would price every line
   * off the wrong row.
   */
  it("keeps ProductPrice.minQuantity defaulting to 1, not 0", async () => {
    const facts = await columnFacts("ProductPrice", "minQuantity");
    expect(facts?.column_default).not.toBeNull();
    expect(Number(facts?.column_default?.replace(/::.*$/, ""))).toBe(1);
  });

  it("leaves no double precision behind on Product, ProductPrice or PriceList", async () => {
    const rows = await prisma.$queryRaw<Array<{ table_name: string; column_name: string }>>`
      SELECT table_name, column_name FROM information_schema.columns
      WHERE table_name IN ('Product', 'ProductPrice', 'PriceList')
        AND data_type = 'double precision'
      ORDER BY table_name, column_name
    `;
    expect(rows.map((row) => `${row.table_name}.${row.column_name}`)).toEqual([]);
  });
});

describe("PriceListKind carries a retail shelf-price list", () => {
  it("has RETAIL", async () => {
    expect(await enumLabels("PriceListKind")).toContain("RETAIL");
  });

  /**
   * An enum may gain values and must never lose one — Postgres refuses to drop a
   * label a row still uses, and rewriting or deleting those rows falsifies the
   * data. So the five that were there before S-1 are asserted present rather than
   * the set being asserted equal.
   */
  it.each(["STANDARD", "WHOLESALE", "TRADE", "VIP", "REGIONAL"])(
    "still has %s",
    async (label) => {
      expect(await enumLabels("PriceListKind")).toContain(label);
    },
  );

  it("accepts RETAIL as a value of the type", async () => {
    const rows = await prisma.$queryRawUnsafe<Array<{ value: string }>>(
      `SELECT 'RETAIL'::"PriceListKind" AS value`,
    );
    expect(rows[0]?.value).toBe("RETAIL");
  });

  it("still refuses a kind outside the type", async () => {
    await expect(
      prisma.$executeRawUnsafe(`SELECT 'SHELF'::"PriceListKind"`),
    ).rejects.toThrow();
  });
});

describe("the price engine's new columns exist, typed and nullable as declared", () => {
  it("has a column to check for every entry", () => {
    expect(NEW_COLUMNS.length).toBe(5);
  });

  it.each(NEW_COLUMNS)(
    '"%s"."%s" is %s',
    async (table, column, dataType, nullable) => {
      const facts = await columnFacts(table, column);
      expect(facts, `no such column "${table}"."${column}"`).not.toBeNull();
      expect(facts?.data_type).toBe(dataType);
      expect(facts?.is_nullable).toBe(nullable ? "YES" : "NO");
    },
  );

  /**
   * A deposit is money. `numeric` alone would be satisfied by an unconstrained
   * `numeric`, which is not the same guarantee.
   */
  it("Product.depositAmount is numeric(14,2)", async () => {
    const facts = await columnFacts("Product", "depositAmount");
    expect(facts?.numeric_precision).toBe(14);
    expect(facts?.numeric_scale).toBe(2);
  });

  /**
   * `false` on every existing row and every future one that does not say
   * otherwise. A `taxInclusive` that defaulted to true would restate every price
   * list a tenant already had.
   */
  it.each([
    ["PriceList", "taxInclusive"],
    ["Product", "ageRestricted"],
    ["Product", "returnable"],
  ])('"%s"."%s" defaults to false', async (table, column) => {
    const facts = await columnFacts(table, column);
    expect(facts?.column_default).toBe("false");
  });

  /**
   * The till scans a barcode and wants an answer before the next item. Indexed,
   * and deliberately not unique — `RetailCatalogItem` already holds distinct SKUs
   * sharing a barcode inside one company and one site, so a unique constraint
   * would pass on today's empty column and block the S-4 backfill.
   */
  it("indexes Product barcode without making it unique", async () => {
    const rows = await prisma.$queryRaw<Array<{ indexdef: string }>>`
      SELECT indexdef FROM pg_indexes
      WHERE tablename = 'Product' AND indexname = 'Product_companyId_barcode_idx'
    `;
    expect(rows.length, "Product_companyId_barcode_idx does not exist").toBe(1);
    expect(rows[0]?.indexdef).not.toMatch(/UNIQUE/i);
  });

  it("has no unique constraint on Product barcode", async () => {
    const rows = await prisma.$queryRaw<Array<{ indexname: string }>>`
      SELECT indexname FROM pg_indexes
      WHERE tablename = 'Product' AND indexdef ILIKE '%UNIQUE%' AND indexdef ILIKE '%barcode%'
    `;
    expect(rows.map((row) => row.indexname)).toEqual([]);
  });
});
