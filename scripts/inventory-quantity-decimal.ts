/**
 * S-1, the five columns the first pass deferred.
 *
 *   npx tsx scripts/inventory-quantity-decimal.ts
 *
 * `scripts/inventory-money-decimal.ts` converted the six *pricing* columns and
 * left these five as `Float` on purpose, with the reason written down: 38 files
 * read them, the cascade crosses four modules, and doing it days before a Harare
 * bottle store traded on this for a full day bought nothing for that day. The
 * deferral was a named ticket, not an oversight, and this is the ticket.
 *
 *   InventoryItem.currentStock   numeric(12,4)
 *   InventoryItem.minStock       numeric(12,4)   nullable
 *   InventoryItem.maxStock       numeric(12,4)   nullable
 *   InventoryItem.unitCost       numeric(14,2)   nullable
 *   StockMovement.quantity       numeric(12,4)
 *
 * ── Why `unitCost` is at money scale and the rest are not ──────────────────
 *
 * Four of these are quantities and one is money, and treating them alike is the
 * mistake that makes this worth doing at all.
 *
 * `unitCost` **is money**. It is what a goods receipt writes, what
 * `RetailSaleLine.costUnit` is copied from, and therefore what every margin
 * figure retail reports is computed against. Held as a double it is subject to
 * the same drift `lib/money.ts` exists to end — and unlike a shelf price, which
 * a shopkeeper reads and would notice, a cost price is summed across thousands
 * of lines before anybody looks at it. `numeric(14,2)`, like every other money
 * column in the schema.
 *
 * The four quantities go to `numeric(12,4)`, the scale `lib/money.ts` defines
 * for quantities and rates. A bottle store counts whole bottles, but the column
 * is not a bottle-store column: it holds fuel in litres and gold in grams
 * elsewhere in this product, and four places is what those need.
 *
 * ## What this cannot fix
 *
 * A `Float` that has already lost precision stays lost. The cast preserves what
 * is in the column, and the measurement pass below reports how much any of it
 * moves — but a quantity that drifted in 2024 arrives here already wrong. What
 * the conversion buys is that it stops happening from today.
 *
 * ## Why a script
 *
 * `prisma db push` cannot reach this database (P1001 — only a Neon pooler host
 * is configured), and a blind `ALTER … TYPE numeric(12,4)` on a populated column
 * fails outright on the first row that will not fit. The engine in
 * `scripts/lib/decimal-cast.ts` measures every column first, refuses on overflow
 * or on unexpected rounding, casts in one transaction, and reads the result back
 * out of `information_schema` rather than out of its own counters.
 *
 * Idempotent: a column already at its target scale is reported and skipped.
 */

// Before the Prisma client is constructed: `lib/prisma.ts` reads
// `process.env.DATABASE_URL` at import time, and nothing else in a `tsx` script
// loads `.env`.
import "dotenv/config"

import { convertColumns, MONEY, QTY, type DecimalColumn } from "@/scripts/lib/decimal-cast"

const COLUMNS: readonly DecimalColumn[] = [
  { table: "InventoryItem", column: "currentStock", ...QTY },
  { table: "InventoryItem", column: "minStock", ...QTY },
  { table: "InventoryItem", column: "maxStock", ...QTY },
  // The one that is money. See the header.
  { table: "InventoryItem", column: "unitCost", ...MONEY },
  { table: "StockMovement", column: "quantity", ...QTY },
]

convertColumns(COLUMNS, { label: "core quantity" }).catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})
