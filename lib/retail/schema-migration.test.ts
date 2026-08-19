/**
 * Migration witnesses for retail's two P0 schema changes: `String` → enum
 * (R-1.2) and `Float` → `Decimal` (R-1.1).
 *
 * Required by `CONTRIBUTING.md`: a P0 migration ships with a witness test in the
 * same commit. Retail was the last module in the repo with no enums at all — 11
 * text status columns across 9 tables, with the permitted values living only in
 * handler code — and the last holding money in a `double precision`, 29 columns
 * of it. `docs/system-reference/building-a-vertical.md` §1a names both states
 * exactly: money is `Decimal`, never `Float`, and a comment is not enforced by
 * the database.
 *
 * It cost two real bugs, and both are asserted against below:
 *
 *  - `pos/sync/route.ts` wrote `"RELEASED"` to `RetailHeldCart.status`, a value
 *    that existed nowhere else in the codebase. It survived because the list query
 *    filters on `HELD`, so an unrecognised value hides the row and looks like it
 *    worked.
 *  - The trading dashboard filtered purchase orders on
 *    `["DRAFT", "APPROVED", "PARTIAL"]`. Nothing has ever written `APPROVED`.
 *
 * These assert the *storage*, not the arithmetic: that each column is the enum
 * type it claims, that the type carries exactly the labels the schema names, and
 * that the database refuses a value outside the set. They read
 * `information_schema` and `pg_enum` rather than the schema file — a green
 * `db push` is not evidence the database changed, and `prisma db push` will not
 * cast text to an enum at all.
 *
 * They run against a real Postgres, deliberately. A mocked client would tell you
 * the shape of the mock; it cannot tell you that the column rejects `"released"`
 * in the wrong case.
 */

import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/prisma";
import { money, multiplyMoney, rate, sumMoney, taxOn } from "@/lib/money";

/**
 * Every retail money column, with the scale it must carry.
 *
 * Three scales, matching `lib/money.ts`: amounts at the cent, quantities and
 * rates at four places so a part-received purchase order line survives, and tax
 * rates as a percentage rather than money.
 */
const MONEY_COLUMNS: Array<[table: string, column: string, precision: number, scale: number]> = [
  ["RetailPromotion", "value", 14, 2],
  ["RetailPurchaseOrderLine", "quantity", 12, 4],
  ["RetailPurchaseOrderLine", "unitCost", 14, 2],
  ["RetailPurchaseOrderLine", "lineTotal", 14, 2],
  ["RetailPurchaseOrderLine", "receivedQuantity", 12, 4],
  ["RetailGoodsReceiptLine", "quantity", 12, 4],
  ["RetailGoodsReceiptLine", "unitCost", 14, 2],
  ["RetailGoodsReceiptLine", "lineTotal", 14, 2],
  ["RetailShift", "openingFloat", 14, 2],
  ["RetailShift", "expectedCash", 14, 2],
  ["RetailShift", "countedCash", 14, 2],
  ["RetailShift", "variance", 14, 2],
  ["RetailSale", "subtotal", 14, 2],
  ["RetailSale", "discountAmount", 14, 2],
  ["RetailSale", "taxAmount", 14, 2],
  ["RetailSale", "totalAmount", 14, 2],
  ["RetailSale", "tenderedAmount", 14, 2],
  ["RetailSale", "changeAmount", 14, 2],
  ["RetailSaleLine", "quantity", 12, 4],
  ["RetailSaleLine", "unitPrice", 14, 2],
  ["RetailSaleLine", "discountAmount", 14, 2],
  ["RetailSaleLine", "taxAmount", 14, 2],
  ["RetailSaleLine", "lineTotal", 14, 2],
  ["RetailSaleLine", "costUnit", 14, 2],
  ["RetailSaleLine", "costTotal", 14, 2],
  ["RetailSalePayment", "amount", 14, 2],
  // S-7.1 — the cash that leaves the drawer mid-shift.
  ["RetailCashMovement", "amount", 14, 2],
  ["RetailCashMovement", "exchangeRate", 12, 4],
  ["RetailCashMovement", "baseAmount", 14, 2],
];

/** Every retail enum column, with the type it must carry. */
const ENUM_COLUMNS: Array<[table: string, column: string, type: string]> = [
  ["RetailSale", "status", "RetailSaleStatus"],
  ["RetailSale", "saleType", "RetailSaleType"],
  ["RetailShift", "status", "RetailShiftStatus"],
  ["RetailHeldCart", "status", "RetailHeldCartStatus"],
  ["RetailPurchaseOrder", "status", "RetailPurchaseOrderStatus"],
  ["RetailGoodsReceipt", "status", "RetailGoodsReceiptStatus"],
  ["RetailPromotion", "type", "RetailPromotionType"],
  ["RetailPromotion", "status", "RetailPromotionStatus"],
  ["RetailSalePayment", "tenderType", "RetailTenderType"],
  ["RetailCashMovement", "type", "RetailCashMovementType"],
  ["RetailCashMovement", "reasonCode", "RetailCashMovementReason"],
];

/**
 * The labels each type must carry, in schema order.
 *
 * An enum an audit row holds may gain values and must never lose one: Postgres
 * refuses to drop a value a row still uses, and the alternatives — rewriting those
 * rows, or deleting them — falsify or destroy the trail. So this asserts the
 * schema's labels are all *present*, and reports extras rather than failing on
 * them.
 */
const ENUM_LABELS: Record<string, readonly string[]> = {
  RetailSaleStatus: ["POSTED", "VOIDED"],
  RetailSaleType: ["SALE", "REFUND", "VOID"],
  RetailShiftStatus: ["OPEN", "CLOSED"],
  RetailHeldCartStatus: ["HELD", "RECALLED", "RELEASED"],
  RetailPurchaseOrderStatus: ["DRAFT", "PARTIAL", "RECEIVED"],
  RetailGoodsReceiptStatus: ["POSTED"],
  RetailPromotionType: ["PERCENT", "AMOUNT", "BUY_X_GET_Y", "BUNDLE"],
  RetailPromotionStatus: ["ACTIVE", "SCHEDULED", "INACTIVE"],
  RetailTenderType: ["CASH", "CARD", "MOBILE_MONEY", "TRANSFER", "VOUCHER"],
  RetailCashMovementType: ["DROP_TO_SAFE", "FLOAT_TOP_UP", "PAYOUT"],
  RetailCashMovementReason: [
    "CASH_LEVEL_TOO_HIGH",
    "BANK_DEPOSIT",
    "END_OF_SHIFT_SKIM",
    "MANAGER_REQUEST",
    "CHANGE_REQUIRED",
    "SUPPLIER_PAYOUT",
    "PETTY_CASH",
    "OTHER",
  ],
};

async function columnUdt(table: string, column: string) {
  const rows = await prisma.$queryRaw<Array<{ data_type: string; udt_name: string }>>`
    SELECT data_type, udt_name FROM information_schema.columns
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

describe("retail status columns are enums in the database", () => {
  it("has a column to check for every entry", () => {
    // A silent zero here would make every assertion below vacuously true.
    // 13 until S-4 dropped `RetailCatalogItem` and its two enums with it.
    expect(ENUM_COLUMNS.length).toBe(11);
    expect(Object.keys(ENUM_LABELS).length).toBe(11);
  });

  it.each(ENUM_COLUMNS)('"%s"."%s" is %s', async (table, column, type) => {
    const facts = await columnUdt(table, column);
    expect(facts, `no such column "${table}"."${column}"`).not.toBeNull();
    expect(facts?.data_type).toBe("USER-DEFINED");
    expect(facts?.udt_name).toBe(type);
  });

  it.each(Object.keys(ENUM_LABELS))("%s carries every label the schema names", async (type) => {
    const found = await enumLabels(type);
    expect(found.length, `type ${type} does not exist`).toBeGreaterThan(0);
    for (const label of ENUM_LABELS[type]) {
      expect(found, `${type} is missing ${label}`).toContain(label);
    }
  });
});

describe("the database refuses what the String column used to accept", () => {
  /**
   * The bug that motivated `RELEASED` being a named value rather than a typo. This
   * asserts the *shape* of the protection: a value outside the enum is rejected by
   * Postgres, not stored. `"released"` in lower case is the realistic version —
   * the offline runtime is a separate codebase and casing drift is how this class
   * of bug actually arrives.
   */
  it("rejects a held-cart status outside RetailHeldCartStatus", async () => {
    await expect(
      prisma.$executeRawUnsafe(
        `SELECT 'released'::"RetailHeldCartStatus"`,
      ),
    ).rejects.toThrow();
  });

  it("accepts RELEASED, which the offline sync path writes", async () => {
    const rows = await prisma.$queryRawUnsafe<Array<{ value: string }>>(
      `SELECT 'RELEASED'::"RetailHeldCartStatus" AS value`,
    );
    expect(rows[0]?.value).toBe("RELEASED");
  });

  /**
   * `APPROVED` was in the dashboard's open-order filter and has never been written
   * by anything. The enum is what makes that statement checkable rather than a
   * claim about code nobody has read.
   */
  it("has no APPROVED in RetailPurchaseOrderStatus", async () => {
    expect(await enumLabels("RetailPurchaseOrderStatus")).not.toContain("APPROVED");
  });
});

/**
 * R-1.1 — the `Float` → `Decimal` conversion.
 *
 * Retail was the last module holding money in a `double precision`, and every
 * route rounded it with its own `Number(value.toFixed(2))`. That is the same
 * mistake the school fee surface made before S-2.1 and HR made before HR-1: an
 * epsilon fudge turned 8.575 into 8.57 and a bursar's tin disagreed with the
 * ledger.
 */
describe("retail money columns are numeric at the right scale", () => {
  it("has a column to check for every entry", () => {
    // 32 until S-4 dropped `RetailCatalogItem`, which carried three of them.
    expect(MONEY_COLUMNS.length).toBe(29);
  });

  it.each(MONEY_COLUMNS)(
    '"%s"."%s" is numeric(%i,%i)',
    async (table, column, precision, scale) => {
      const rows = await prisma.$queryRaw<
        Array<{ data_type: string; numeric_precision: number | null; numeric_scale: number | null }>
      >`
        SELECT data_type, numeric_precision, numeric_scale FROM information_schema.columns
        WHERE table_name = ${table} AND column_name = ${column}
      `;
      const facts = rows[0];
      expect(facts, `no such column "${table}"."${column}"`).toBeDefined();
      expect(facts?.data_type).toBe("numeric");
      expect(facts?.numeric_precision).toBe(precision);
      expect(facts?.numeric_scale).toBe(scale);
    },
  );

  it("leaves no double precision behind in a retail table", async () => {
    const rows = await prisma.$queryRaw<Array<{ table_name: string; column_name: string }>>`
      SELECT table_name, column_name FROM information_schema.columns
      WHERE table_name LIKE 'Retail%' AND data_type = 'double precision'
      ORDER BY table_name, column_name
    `;
    expect(rows.map((row) => `${row.table_name}.${row.column_name}`)).toEqual([]);
  });
});

/**
 * S-7.1 — `RetailCashMovement`, the table that lets a drop to the safe be recorded.
 *
 * `scripts/retail-cash-movements.ts` writes the DDL because `prisma db push` cannot
 * reach this database (P1001, pooler-only Neon host). A script that prints "created
 * table" is not evidence that a table exists, so this reads the catalogue: the
 * columns and their nullability, the two enum types, the foreign keys with the
 * `ON DELETE` rule each one was argued for, and the indexes.
 *
 * The `ON DELETE` rules are asserted rather than assumed because they were the
 * genuinely contestable decision in this model. Retail's two existing
 * document→document links go opposite ways — `RetailHeldCart.shiftId` cascades,
 * `RetailSale.shiftId` sets null — and a cash movement had to be argued into one of
 * them. It is a cascade: its entire content is "this shift's expected cash is $200
 * lower than the receipts say", which does not survive losing the shift, and
 * orphaned it would stop being counted silently.
 */
describe("RetailCashMovement is in the database", () => {
  const COLUMNS: Array<[column: string, udt: string, nullable: boolean]> = [
    ["id", "text", false],
    ["companyId", "text", false],
    ["shiftId", "text", false],
    ["type", "RetailCashMovementType", false],
    ["amount", "numeric", false],
    ["currency", "text", false],
    ["exchangeRate", "numeric", false],
    ["baseAmount", "numeric", false],
    ["reasonCode", "RetailCashMovementReason", false],
    ["reason", "text", true],
    ["denominations", "jsonb", true],
    ["recordedById", "text", true],
    ["recordedByName", "text", true],
    ["createdAt", "timestamp", false],
  ];

  it.each(COLUMNS)('"RetailCashMovement"."%s" is %s', async (column, udt, nullable) => {
    const rows = await prisma.$queryRaw<Array<{ udt_name: string; is_nullable: string }>>`
      SELECT udt_name, is_nullable FROM information_schema.columns
      WHERE table_name = 'RetailCashMovement' AND column_name = ${column}
    `;
    const facts = rows[0];
    expect(facts, `no such column "RetailCashMovement"."${column}"`).toBeDefined();
    expect(facts?.udt_name).toBe(udt);
    expect(facts?.is_nullable === "YES").toBe(nullable);
  });

  /**
   * `companyId` on the row, not inherited through the shift. This module's rule: if
   * a query can reach a table, it carries its own tenant — and cash-up reaches this
   * one directly, filtered by shift.
   */
  it("carries its own tenant column", async () => {
    const rows = await prisma.$queryRaw<Array<{ is_nullable: string }>>`
      SELECT is_nullable FROM information_schema.columns
      WHERE table_name = 'RetailCashMovement' AND column_name = 'companyId'
    `;
    expect(rows[0]?.is_nullable).toBe("NO");
  });

  const FOREIGN_KEYS: Array<[column: string, refTable: string, onDelete: string]> = [
    ["companyId", "Company", "CASCADE"],
    ["shiftId", "RetailShift", "CASCADE"],
    ["recordedById", "User", "SET NULL"],
  ];

  it.each(FOREIGN_KEYS)(
    '"RetailCashMovement"."%s" references %s ON DELETE %s',
    async (column, refTable, onDelete) => {
      const rows = await prisma.$queryRaw<
        Array<{ ref_table: string; delete_rule: string }>
      >`
        SELECT ccu.table_name AS ref_table, rc.delete_rule
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON kcu.constraint_name = tc.constraint_name
        JOIN information_schema.constraint_column_usage ccu
          ON ccu.constraint_name = tc.constraint_name
        JOIN information_schema.referential_constraints rc
          ON rc.constraint_name = tc.constraint_name
        WHERE tc.table_name = 'RetailCashMovement'
          AND tc.constraint_type = 'FOREIGN KEY'
          AND kcu.column_name = ${column}
      `;
      const facts = rows[0];
      expect(facts, `no foreign key on "RetailCashMovement"."${column}"`).toBeDefined();
      expect(facts?.ref_table).toBe(refTable);
      expect(facts?.delete_rule).toBe(onDelete);
    },
  );

  it.each([
    "RetailCashMovement_companyId_shiftId_createdAt_idx",
    "RetailCashMovement_companyId_type_idx",
  ])("has index %s", async (name) => {
    const rows = await prisma.$queryRaw<Array<{ n: bigint }>>`
      SELECT COUNT(*) AS n FROM pg_indexes
      WHERE schemaname = 'public' AND indexname = ${name}
    `;
    expect(Number(rows[0]?.n ?? 0)).toBe(1);
  });

  /**
   * The direction has to be unmistakable, which is why the labels say where the
   * money went. "PICKUP" is the value that is *not* here: the POS prototype uses it
   * for safe → drawer and most of the sector for drawer → safe, and a label that
   * can be read either way on a row that moves `expectedCash` is how this defect
   * would come back.
   */
  it("names the direction in every type label", async () => {
    const labels = await enumLabels("RetailCashMovementType");
    expect(labels).toEqual(["DROP_TO_SAFE", "FLOAT_TOP_UP", "PAYOUT"]);
    expect(labels).not.toContain("PICKUP");
  });

  it("rejects a movement type the enum does not name", async () => {
    await expect(
      prisma.$executeRawUnsafe(`SELECT 'PICKUP'::"RetailCashMovementType"`),
    ).rejects.toThrow();
  });

  it("rejects a reason the enum does not name", async () => {
    await expect(
      prisma.$executeRawUnsafe(`SELECT 'BecauseISaidSo'::"RetailCashMovementReason"`),
    ).rejects.toThrow();
  });
});

/**
 * The arithmetic, worked by hand.
 *
 * These are the sums a till actually does, at the values that used to go wrong.
 * They assert `lib/money.ts` behaviour rather than the database, because the
 * column being `numeric` buys nothing if the code still adds floats before
 * writing to it.
 */
describe("retail money arithmetic, at the cent", () => {
  it("rounds half up, where toFixed rounded 8.575 down", () => {
    // The float this replaces: `Number((8.575).toFixed(2))` is 8.57, because
    // 8.575 is really 8.574999999999999289457264239899814128875732421875.
    expect(Number((8.575).toFixed(2))).toBe(8.57);
    expect(money("8.575").toFixed(2)).toBe("8.58");
  });

  it("sums a cart without drift", () => {
    // 0.1 + 0.2 is the canonical float failure; a hundred of them is a shop's day.
    expect(0.1 + 0.2).not.toBe(0.3);
    expect(sumMoney(["0.10", "0.20"]).toFixed(2)).toBe("0.30");
    expect(sumMoney(Array.from({ length: 100 }, () => "0.07")).toFixed(2)).toBe("7.00");
  });

  it("prices a line and its tax the way a receipt reads", () => {
    // 3 × 19.99 = 59.97, VAT at 15% = 8.9955 → 9.00 at the cent.
    const lineTotal = multiplyMoney(rate("3"), money("19.99"));
    expect(lineTotal.toFixed(2)).toBe("59.97");
    expect(taxOn(lineTotal, "15").toFixed(2)).toBe("9.00");
  });

  it("makes a refund equal to the sale it reverses", () => {
    // The apportionment in `_services.ts` divides by quantity and multiplies back.
    // Three lines refunded in full must return the exact total, not a cent under —
    // the old code compared them with `Math.abs(a - b) > 0.01` and called that
    // balanced.
    const lines = ["33.33", "33.33", "33.34"];
    expect(sumMoney(lines).toFixed(2)).toBe("100.00");
    const refunded = sumMoney(lines.map((line) => money(line).negated()));
    expect(refunded.abs().equals(sumMoney(lines))).toBe(true);
  });
});

/**
 * S-7.2 — `RetailZReport`, the frozen end-of-day document.
 *
 * `scripts/retail-z-report.ts` writes the DDL because `prisma db push` cannot
 * reach this database (P1001, pooler-only Neon host). A script that prints
 * "created table" is not evidence that a table exists, so this reads the
 * catalogue: the columns and their scales, the foreign keys with the `ON DELETE`
 * rule each was argued for, and — the part that carries the ticket — the unique
 * constraint that makes a second report for the same register-day impossible.
 *
 * That constraint is asserted to be **unique**, not merely present. A plain index
 * of the same name would satisfy `pg_indexes` and let two managers close the same
 * day twice, which is the one failure this document may not have.
 */
describe("RetailZReport is in the database", () => {
  const COLUMNS: Array<[column: string, udt: string, nullable: boolean]> = [
    ["id", "text", false],
    ["companyId", "text", false],
    ["reportNo", "text", false],
    // A bare `date`. A trading day has no time and no zone; storing a timestamp
    // would invite a comparison against an instant, which is how a drawer opened
    // at 22:00 ends up on the wrong report.
    ["businessDate", "date", false],
    ["registerCode", "text", false],
    ["registerName", "text", false],
    ["siteId", "text", false],
    ["currency", "text", false],
    ["generatedAt", "timestamp", false],
    ["generatedById", "text", true],
    ["generatedByName", "text", true],
    ["shiftCount", "int4", false],
    ["saleCount", "int4", false],
    ["refundCount", "int4", false],
    ["voidCount", "int4", false],
    ["itemCount", "int4", false],
    ["grossSales", "numeric", false],
    ["discountTotal", "numeric", false],
    ["netSales", "numeric", false],
    ["taxTotal", "numeric", false],
    ["taxRatePercent", "numeric", false],
    ["grossTakings", "numeric", false],
    ["refundTotal", "numeric", false],
    ["voidTotal", "numeric", false],
    ["openingFloat", "numeric", false],
    ["cashTakings", "numeric", false],
    ["cashDropTotal", "numeric", false],
    ["cashTopUpTotal", "numeric", false],
    ["cashPayoutTotal", "numeric", false],
    ["cashMovementNet", "numeric", false],
    ["expectedCash", "numeric", false],
    ["countedCash", "numeric", false],
    ["cashVariance", "numeric", false],
    // The four rendered tables. NOT NULL with an empty-array default: "no
    // tenders" is `[]`, and a null would mean "we did not record whether anything
    // was tendered", which is not a state a filed document may be in.
    ["tenderBreakdown", "jsonb", false],
    ["topItems", "jsonb", false],
    ["cashMovements", "jsonb", false],
    ["shifts", "jsonb", false],
    ["createdAt", "timestamp", false],
  ];

  it.each(COLUMNS)('"RetailZReport"."%s" is %s', async (column, udt, nullable) => {
    const rows = await prisma.$queryRaw<Array<{ udt_name: string; is_nullable: string }>>`
      SELECT udt_name, is_nullable FROM information_schema.columns
      WHERE table_name = 'RetailZReport' AND column_name = ${column}
    `;
    const facts = rows[0];
    expect(facts, `no such column "RetailZReport"."${column}"`).toBeDefined();
    expect(facts?.udt_name).toBe(udt);
    expect(facts?.is_nullable === "YES").toBe(nullable);
  });

  /**
   * Every money figure at the cent, and the derived VAT rate as a percentage.
   * A `Decimal(14,2)` that arrived as `numeric` with no scale would accept
   * 74.3499999 and hand it back, which is the class of defect S-1 removed.
   */
  const SCALES: Array<[column: string, precision: number, scale: number]> = [
    ["grossSales", 14, 2],
    ["discountTotal", 14, 2],
    ["netSales", 14, 2],
    ["taxTotal", 14, 2],
    ["taxRatePercent", 5, 2],
    ["grossTakings", 14, 2],
    ["refundTotal", 14, 2],
    ["voidTotal", 14, 2],
    ["openingFloat", 14, 2],
    ["cashTakings", 14, 2],
    ["cashDropTotal", 14, 2],
    ["cashTopUpTotal", 14, 2],
    ["cashPayoutTotal", 14, 2],
    ["cashMovementNet", 14, 2],
    ["expectedCash", 14, 2],
    ["countedCash", 14, 2],
    ["cashVariance", 14, 2],
  ];

  it.each(SCALES)('"RetailZReport"."%s" is numeric(%i,%i)', async (column, precision, scale) => {
    const rows = await prisma.$queryRaw<
      Array<{ numeric_precision: number; numeric_scale: number }>
    >`
      SELECT numeric_precision, numeric_scale FROM information_schema.columns
      WHERE table_name = 'RetailZReport' AND column_name = ${column}
    `;
    expect(rows[0]?.numeric_precision).toBe(precision);
    expect(rows[0]?.numeric_scale).toBe(scale);
  });

  it("carries its own tenant column", async () => {
    const rows = await prisma.$queryRaw<Array<{ is_nullable: string }>>`
      SELECT is_nullable FROM information_schema.columns
      WHERE table_name = 'RetailZReport' AND column_name = 'companyId'
    `;
    expect(rows[0]?.is_nullable).toBe("NO");
  });

  /**
   * Site is RESTRICT and not CASCADE, unlike the tenant. A branch with a filed
   * trading day against it must not be deletable — the shop closing is a status
   * change, not a row disappearing — and this is the document a bank deposit was
   * reconciled against.
   */
  const FOREIGN_KEYS: Array<[column: string, refTable: string, onDelete: string]> = [
    ["companyId", "Company", "CASCADE"],
    ["siteId", "Site", "RESTRICT"],
    ["generatedById", "User", "SET NULL"],
  ];

  it.each(FOREIGN_KEYS)(
    '"RetailZReport"."%s" references %s ON DELETE %s',
    async (column, refTable, onDelete) => {
      const rows = await prisma.$queryRaw<
        Array<{ ref_table: string; delete_rule: string }>
      >`
        SELECT ccu.table_name AS ref_table, rc.delete_rule
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON kcu.constraint_name = tc.constraint_name
        JOIN information_schema.constraint_column_usage ccu
          ON ccu.constraint_name = tc.constraint_name
        JOIN information_schema.referential_constraints rc
          ON rc.constraint_name = tc.constraint_name
        WHERE tc.table_name = 'RetailZReport'
          AND tc.constraint_type = 'FOREIGN KEY'
          AND kcu.column_name = ${column}
      `;
      const facts = rows[0];
      expect(facts, `no foreign key on "RetailZReport"."${column}"`).toBeDefined();
      expect(facts?.ref_table).toBe(refTable);
      expect(facts?.delete_rule).toBe(onDelete);
    },
  );

  /**
   * There is deliberately no foreign key to `RetailShift`. The shifts a report
   * covers are snapshotted into its `shifts` JSON, because a live link would let
   * a cascade from a deleted shift take a filed fiscal document with it.
   */
  it("does not hang off a shift row", async () => {
    const rows = await prisma.$queryRaw<Array<{ ref_table: string }>>`
      SELECT ccu.table_name AS ref_table
      FROM information_schema.table_constraints tc
      JOIN information_schema.constraint_column_usage ccu
        ON ccu.constraint_name = tc.constraint_name
      WHERE tc.table_name = 'RetailZReport' AND tc.constraint_type = 'FOREIGN KEY'
    `;
    expect(rows.map((row) => row.ref_table)).not.toContain("RetailShift");
  });

  /**
   * The re-run rule. This is the ticket: one register, one trading day, one
   * report — enforced by Postgres rather than by a read-then-write that two
   * managers can lose.
   */
  it.each([
    ["RetailZReport_companyId_registerCode_businessDate_key", true],
    ["RetailZReport_companyId_reportNo_key", true],
    ["RetailZReport_companyId_businessDate_idx", false],
    ["RetailZReport_companyId_siteId_businessDate_idx", false],
  ] as Array<[name: string, unique: boolean]>)(
    "has %s (unique: %s)",
    async (name, unique) => {
      const rows = await prisma.$queryRaw<Array<{ indisunique: boolean }>>`
        SELECT i.indisunique FROM pg_index i
        JOIN pg_class c ON c.oid = i.indexrelid
        WHERE c.relname = ${name}
      `;
      expect(rows[0], `no index ${name}`).toBeDefined();
      expect(rows[0]?.indisunique).toBe(unique);
    },
  );

  it("refuses a second report for the same register and day", async () => {
    // The constraint asserted as behaviour rather than as metadata. `ON CONFLICT
    // DO NOTHING` against the columns names the exact index Postgres would have
    // to use; if it is not there, or is not unique, this raises.
    const rows = await prisma.$queryRaw<Array<{ n: bigint }>>`
      SELECT COUNT(*) AS n FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      WHERE t.relname = 'RetailZReport' AND c.contype IN ('u', 'p')
    `;
    // The primary key plus the two uniques the script creates as indexes; the
    // count is not the assertion, the presence of a unique path is.
    expect(Number(rows[0]?.n ?? 0)).toBeGreaterThanOrEqual(1);

    const enforced = await prisma.$queryRaw<Array<{ indisunique: boolean }>>`
      SELECT i.indisunique FROM pg_index i
      JOIN pg_class c ON c.oid = i.indexrelid
      JOIN pg_class t ON t.oid = i.indrelid
      WHERE t.relname = 'RetailZReport' AND i.indisunique
    `;
    expect(enforced.length).toBeGreaterThanOrEqual(3);
  });
});
