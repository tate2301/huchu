/**
 * A 5,000-row file, the most an upload takes (SET-11), against the test
 * database: parsed, checked, and put in 200 rows a call, as the page calls,
 * every row with a cost and opening stock so each one also posts its opening
 * journal. Each call is timed: no call may come near the commit route's
 * `maxDuration`, however long the whole file takes.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { postRetailJournal } from "@/app/api/v2/retail/_helpers";
import { runAccountingSeedPack } from "@/lib/accounting/bootstrap";
import { destroyProvisionedTenant } from "@/lib/platform/tenant-teardown";
import { prisma } from "@/lib/prisma";
import { makeTestShop, type TestShop } from "@/lib/retail/products/test-fixtures";

import { maxDuration } from "@/app/api/v2/retail/products/import/[id]/commit/route";

import { BATCH, commitImport } from "./commit";
import { parseSheet } from "./parse";
import { createImport, loadImportPage } from "./store";
import { MAX_ROWS } from "./words";

let shop: TestShop;

beforeAll(async () => {
  shop = await makeTestShop("ImportLarge");
  await runAccountingSeedPack({ companyId: shop.companyId, mode: "APPLY" });
}, 60_000);

afterAll(async () => {
  if (!shop) return;
  await prisma.journalLine.deleteMany({ where: { entry: { companyId: shop.companyId } } });
  await prisma.journalEntry.deleteMany({ where: { companyId: shop.companyId } });
  await prisma.accountingIntegrationEvent.deleteMany({ where: { companyId: shop.companyId } });
  await prisma.retailImport.deleteMany({ where: { companyId: shop.companyId } });
  await destroyProvisionedTenant(shop.companyId);
}, 300_000);

describe("a 5,000-row file", () => {
  it("goes in 200 rows a call, each call well inside the route's time", async () => {
    const lines = ["Name,Price,Cost,Opening stock,Barcode"];
    for (let i = 0; i < MAX_ROWS; i += 1) {
      lines.push(`Line ${String(i).padStart(4, "0")},${(1 + (i % 50) / 10).toFixed(2)},0.80,${(i % 24) + 1},${String(60010000000 + i)}`);
    }
    const parsed = await parseSheet(Buffer.from(lines.join("\n")), "five-thousand.csv");
    expect(parsed).toHaveLength(MAX_ROWS);
    const { id } = await createImport(shop.owner(), "five-thousand.csv", parsed);
    const page = (await loadImportPage(shop.companyId, id, "fix"))!;
    expect(page.counts).toEqual({ fix: 0, new: MAX_ROWS, update: 0, done: 0, all: MAX_ROWS });

    const seconds: number[] = [];
    let left = MAX_ROWS;
    for (;;) {
      const started = performance.now();
      const step = await commitImport(shop.owner(), id, postRetailJournal);
      seconds.push((performance.now() - started) / 1000);
      expect(left - step.left).toBeLessThanOrEqual(BATCH);
      left = step.left;
      if (left === 0) {
        expect(step).toEqual({ created: MAX_ROWS, updated: 0, skipped: 0, refused: 0, left: 0 });
        break;
      }
    }
    const total = seconds.reduce((sum, s) => sum + s, 0);
    console.info(
      `[import] 5,000 rows: ${seconds.length} calls, ${total.toFixed(1)} s in all, slowest call ${Math.max(...seconds).toFixed(1)} s, ` +
        `${((total / MAX_ROWS) * 1000).toFixed(1)} ms a row`,
    );
    expect(seconds).toHaveLength(MAX_ROWS / BATCH);
    expect(Math.max(...seconds)).toBeLessThan(maxDuration / 2);
    expect(await prisma.product.count({ where: { companyId: shop.companyId, name: { startsWith: "Line " } } })).toBe(MAX_ROWS);
    expect(await prisma.retailImport.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: "IMPORTED", createdCount: MAX_ROWS });
  }, 1_800_000);
});
