/**
 * S-1 — turns the core **pricing** columns from `double precision` into `numeric`.
 *
 *   npx tsx scripts/inventory-money-decimal.ts && pnpm db:push
 *
 * R-1.1 moved 29 retail columns off `Float` because float money is wrong money.
 * The consolidation plan (`docs/retail/retail-stock-consolidation-plan-2026-08-13.md`
 * §1.4) makes retail read its prices out of core `Product` / `ProductPrice`
 * instead of its own `RetailCatalogItem`, and doing that while those columns are
 * still `Float` would route every carefully-`Decimal` retail number through a
 * double and undo R-1.1 by the back door. So core meets retail's precision bar
 * first, by the same method: measure what would round, refuse on overflow, cast
 * in one transaction, read the result back out of `information_schema`.
 *
 * Six columns, at the three scales `lib/money.ts` defines:
 *
 *   Product.standardPrice        numeric(14,2)   the fallback shelf price
 *   Product.costPrice            numeric(14,2)   nullable
 *   Product.defaultTaxRate       numeric(5,2)    a percentage, not money
 *   Product.maxDiscountPercent   numeric(5,2)    nullable
 *   ProductPrice.unitPrice       numeric(14,2)   what a price list actually says
 *   ProductPrice.minQuantity     numeric(12,4)   the volume break it starts at
 *
 * ## What is deliberately not here
 *
 * `InventoryItem.currentStock` / `minStock` / `maxStock` / `unitCost` and
 * `StockMovement.quantity` are the other five `Float` columns §1.4 names, and
 * they are **left as `Float` on purpose**. This is a recorded decision, not an
 * oversight: those five are read by 38 files across gold, schools and the
 * dashboards, and converting them turns a data migration into a module-wide
 * cascade days before a Harare bottle store trades on this for a full day. The
 * pricing columns are what S-3 and S-4 write into; the stock columns are what
 * S-2 touches, and they convert with it.
 *
 * The engine is `scripts/lib/decimal-cast.ts`, shared with
 * `scripts/retail-money-decimal.ts`. This file is the column list.
 *
 * Idempotent: a column already at its target scale is reported and skipped.
 */

// Before the Prisma client is constructed: `lib/prisma.ts` reads
// `process.env.DATABASE_URL` at import time, and nothing else in a `tsx` script
// loads `.env`.
import "dotenv/config"

import { convertColumns, MONEY, PCT, QTY, type DecimalColumn } from "@/scripts/lib/decimal-cast"

const COLUMNS: readonly DecimalColumn[] = [
  { table: "Product", column: "standardPrice", ...MONEY },
  { table: "Product", column: "costPrice", ...MONEY },
  { table: "Product", column: "defaultTaxRate", ...PCT },
  { table: "Product", column: "maxDiscountPercent", ...PCT },
  { table: "ProductPrice", column: "unitPrice", ...MONEY },
  { table: "ProductPrice", column: "minQuantity", ...QTY },
]

convertColumns(COLUMNS, { label: "core pricing" }).catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})
