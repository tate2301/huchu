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
  ["RetailCatalogItem", "unitPrice", 14, 2],
  ["RetailCatalogItem", "compareAtPrice", 14, 2],
  ["RetailCatalogItem", "taxPercent", 5, 2],
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
];

/** Every retail enum column, with the type it must carry. */
const ENUM_COLUMNS: Array<[table: string, column: string, type: string]> = [
  ["RetailSale", "status", "RetailSaleStatus"],
  ["RetailSale", "saleType", "RetailSaleType"],
  ["RetailShift", "status", "RetailShiftStatus"],
  ["RetailHeldCart", "status", "RetailHeldCartStatus"],
  ["RetailPurchaseOrder", "status", "RetailPurchaseOrderStatus"],
  ["RetailGoodsReceipt", "status", "RetailGoodsReceiptStatus"],
  ["RetailCatalogItem", "status", "RetailCatalogItemStatus"],
  ["RetailCatalogItem", "acquisitionMode", "RetailAcquisitionMode"],
  ["RetailPromotion", "type", "RetailPromotionType"],
  ["RetailPromotion", "status", "RetailPromotionStatus"],
  ["RetailSalePayment", "tenderType", "RetailTenderType"],
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
  RetailCatalogItemStatus: ["ACTIVE", "INACTIVE"],
  RetailAcquisitionMode: ["PURCHASE"],
  RetailPromotionType: ["PERCENT", "AMOUNT", "BUY_X_GET_Y", "BUNDLE"],
  RetailPromotionStatus: ["ACTIVE", "SCHEDULED", "INACTIVE"],
  RetailTenderType: ["CASH", "CARD", "MOBILE_MONEY", "TRANSFER", "VOUCHER"],
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
