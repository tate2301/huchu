/**
 * Turns retail's 29 `double precision` columns into `numeric` at the right scale.
 *
 * **Run this before `pnpm db:push` picks up the schema change:**
 *
 *   npx tsx scripts/retail-money-decimal.ts && pnpm db:push
 *
 * Retail was the last module holding money in a `Float`. Every route rounded it
 * with a local `Number(value.toFixed(2))` — the same mistake the school fee surface
 * made before S-2.1 and HR made before HR-1, where an epsilon fudge turned 8.575
 * into 8.57 and a bursar's tin disagreed with the ledger.
 *
 * The measure-then-cast engine — what rounds, by how much, refuse on overflow,
 * one transaction, read the result back out of the catalogue — lives in
 * `scripts/lib/decimal-cast.ts` now, because S-1 needed the same thing for the
 * core pricing columns (`scripts/inventory-money-decimal.ts`). This file is the
 * list of retail columns and nothing else.
 *
 * Already run, and idempotent: every column below is reported as "already
 * numeric" on a second pass.
 */

// First, and before the Prisma client is constructed: `lib/prisma.ts` reads
// `process.env.DATABASE_URL` at import time, and nothing else in a `tsx` script
// loads `.env`.
import "@/scripts/lib/env";

import { convertColumns, MONEY, PCT, QTY, type DecimalColumn } from "@/scripts/lib/decimal-cast"

const COLUMNS: readonly DecimalColumn[] = [
  { table: "RetailCatalogItem", column: "unitPrice", ...MONEY },
  { table: "RetailCatalogItem", column: "compareAtPrice", ...MONEY },
  { table: "RetailCatalogItem", column: "taxPercent", ...PCT },
  { table: "RetailPromotion", column: "value", ...MONEY },
  { table: "RetailPurchaseOrderLine", column: "quantity", ...QTY },
  { table: "RetailPurchaseOrderLine", column: "unitCost", ...MONEY },
  { table: "RetailPurchaseOrderLine", column: "lineTotal", ...MONEY },
  { table: "RetailPurchaseOrderLine", column: "receivedQuantity", ...QTY },
  { table: "RetailGoodsReceiptLine", column: "quantity", ...QTY },
  { table: "RetailGoodsReceiptLine", column: "unitCost", ...MONEY },
  { table: "RetailGoodsReceiptLine", column: "lineTotal", ...MONEY },
  { table: "RetailShift", column: "openingFloat", ...MONEY },
  { table: "RetailShift", column: "expectedCash", ...MONEY },
  { table: "RetailShift", column: "countedCash", ...MONEY },
  { table: "RetailShift", column: "variance", ...MONEY },
  { table: "RetailSale", column: "subtotal", ...MONEY },
  { table: "RetailSale", column: "discountAmount", ...MONEY },
  { table: "RetailSale", column: "taxAmount", ...MONEY },
  { table: "RetailSale", column: "totalAmount", ...MONEY },
  { table: "RetailSale", column: "tenderedAmount", ...MONEY },
  { table: "RetailSale", column: "changeAmount", ...MONEY },
  { table: "RetailSaleLine", column: "quantity", ...QTY },
  { table: "RetailSaleLine", column: "unitPrice", ...MONEY },
  { table: "RetailSaleLine", column: "discountAmount", ...MONEY },
  { table: "RetailSaleLine", column: "taxAmount", ...MONEY },
  { table: "RetailSaleLine", column: "lineTotal", ...MONEY },
  { table: "RetailSaleLine", column: "costUnit", ...MONEY },
  { table: "RetailSaleLine", column: "costTotal", ...MONEY },
  { table: "RetailSalePayment", column: "amount", ...MONEY },
]

convertColumns(COLUMNS, { label: "retail money" }).catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})
