/**
 * Parity snapshot/compare tool for the Float→Decimal migration (Epic 6).
 *
 * Usage:
 *   npx tsx scripts/decimal-migration-parity.ts snapshot > /tmp/pre-decimal.json
 *   <run migration>
 *   npx tsx scripts/decimal-migration-parity.ts snapshot > /tmp/post-decimal-step1.json
 *   npx tsx scripts/decimal-migration-parity.ts compare /tmp/pre-decimal.json /tmp/post-decimal-step1.json
 *
 * Tolerances: ±0.001 g for gram aggregates, ±$0.01 for USD aggregates.
 * Exits nonzero if any aggregate drifts beyond tolerance.
 */

import "dotenv/config";
import * as fs from "fs";
import { Pool } from "pg";

const connectionString =
  process.env.DATABASE_URL_TEST ?? process.env.DATABASE_URL;

if (!connectionString) {
  console.error("Neither DATABASE_URL_TEST nor DATABASE_URL is set.");
  process.exit(1);
}

const pool = new Pool({ connectionString });

async function sumWhere(
  table: string,
  col: string,
  where?: { col: string; val: string },
): Promise<number> {
  const whereClause = where
    ? `WHERE "${where.col}" = '${where.val}'`
    : "";
  const sql = `SELECT COALESCE(SUM("${col}"::numeric), 0) AS s FROM "${table}" ${whereClause}`;
  const res = await pool.query(sql);
  return parseFloat(res.rows[0].s);
}

async function first(table: string, col: string): Promise<number | null> {
  const sql = `SELECT "${col}"::numeric AS v FROM "${table}" ORDER BY "fetchedAt" DESC LIMIT 1`;
  const res = await pool.query(sql);
  return res.rows.length ? parseFloat(res.rows[0].v) : null;
}

async function snapshot() {
  const aggs = {
    inventoryGramsIn: await sumWhere(
      "GoldInventoryEvent",
      "grams",
      { col: "direction", val: "IN" },
    ),
    inventoryGramsOut: await sumWhere(
      "GoldInventoryEvent",
      "grams",
      { col: "direction", val: "OUT" },
    ),
    pourGrossWeight: await sumWhere("GoldPour", "grossWeight"),
    pourValueUsd: await sumWhere("GoldPour", "valueUsd"),
    receiptPaidAmount: await sumWhere("BuyerReceipt", "paidAmount"),
    purchaseGrossWeight: await sumWhere("GoldPurchase", "grossWeight"),
    purchasePaidAmount: await sumWhere("GoldPurchase", "paidAmount"),
    dispatchValueUsd: await sumWhere("GoldDispatch", "valueUsd"),
    allocationTotalWeight: await sumWhere(
      "GoldShiftAllocation",
      "totalWeight",
    ),
    allocationNetWeight: await sumWhere("GoldShiftAllocation", "netWeight"),
    allocationWorkerShareUsd: await sumWhere(
      "GoldShiftAllocation",
      "workerShareValueUsd",
    ),
    spotPriceLatest: await first("GoldSpotPriceCache", "priceUsdPerGram"),
  };
  return aggs;
}

type Snapshot = Awaited<ReturnType<typeof snapshot>>;

const GRAM_KEYS: Array<keyof Snapshot> = [
  "inventoryGramsIn",
  "inventoryGramsOut",
  "pourGrossWeight",
  "purchaseGrossWeight",
  "allocationTotalWeight",
  "allocationNetWeight",
];

const USD_KEYS: Array<keyof Snapshot> = [
  "pourValueUsd",
  "receiptPaidAmount",
  "purchasePaidAmount",
  "dispatchValueUsd",
  "allocationWorkerShareUsd",
];

const PRICE_KEYS: Array<keyof Snapshot> = ["spotPriceLatest"];

const GRAM_TOLERANCE = 0.001;
const USD_TOLERANCE = 0.01;
const PRICE_TOLERANCE = 0.0001;

function toleranceFor(key: keyof Snapshot): number {
  if (GRAM_KEYS.includes(key)) return GRAM_TOLERANCE;
  if (USD_KEYS.includes(key)) return USD_TOLERANCE;
  if (PRICE_KEYS.includes(key)) return PRICE_TOLERANCE;
  return GRAM_TOLERANCE;
}

function compare(preFile: string, postFile: string): void {
  const pre: Snapshot = JSON.parse(fs.readFileSync(preFile, "utf8"));
  const post: Snapshot = JSON.parse(fs.readFileSync(postFile, "utf8"));

  let failed = false;
  const rows: Array<{
    key: string;
    pre: number | null;
    post: number | null;
    drift: number;
    tolerance: number;
    ok: boolean;
  }> = [];

  for (const key of Object.keys(pre) as Array<keyof Snapshot>) {
    const preVal = pre[key] ?? 0;
    const postVal = post[key] ?? 0;
    const drift = Math.abs((postVal as number) - (preVal as number));
    const tol = toleranceFor(key);
    const ok = drift <= tol;
    if (!ok) failed = true;
    rows.push({
      key,
      pre: preVal as number,
      post: postVal as number,
      drift,
      tolerance: tol,
      ok,
    });
  }

  const pad = (s: string, n: number) => s.padEnd(n);
  console.log(
    pad("Key", 36) +
      pad("Pre", 18) +
      pad("Post", 18) +
      pad("Drift", 14) +
      pad("Tol", 10) +
      "Pass?",
  );
  console.log("-".repeat(100));
  for (const r of rows) {
    console.log(
      pad(r.key, 36) +
        pad(String(r.pre?.toFixed(6)), 18) +
        pad(String(r.post?.toFixed(6)), 18) +
        pad(r.drift.toFixed(6), 14) +
        pad(String(r.tolerance), 10) +
        (r.ok ? "OK" : "FAIL"),
    );
  }

  if (failed) {
    console.error(
      "\nPARITY CHECK FAILED — one or more aggregates drifted beyond tolerance.",
    );
    process.exit(1);
  } else {
    console.log("\nPARITY CHECK PASSED — all aggregates within tolerance.");
  }
}

async function main() {
  const [, , cmd, ...args] = process.argv;

  if (cmd === "snapshot") {
    const snap = await snapshot();
    console.log(JSON.stringify(snap, null, 2));
    await pool.end();
  } else if (cmd === "compare") {
    const [preFile, postFile] = args;
    if (!preFile || !postFile) {
      console.error("Usage: compare <pre.json> <post.json>");
      process.exit(1);
    }
    compare(preFile, postFile);
    await pool.end();
  } else {
    console.error("Usage: decimal-migration-parity.ts <snapshot|compare>");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
