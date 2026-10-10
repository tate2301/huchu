/**
 * Opening stock in the books (PRD-03), against the test database: a new
 * product with 48 at US$1.38 posts one journal, Dr Stock (1200) 66.24 and
 * Cr Opening Balances (3100) 66.24, balanced — the route's own path: create,
 * commit, then post (with the day's run, here Post now). Without a cost it
 * posts nothing.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { postRetailJournal } from "@/app/api/v2/retail/_helpers";
import { runAccountingSeedPack } from "@/lib/accounting/bootstrap";
import { destroyProvisionedTenant } from "@/lib/platform/tenant-teardown";
import { prisma } from "@/lib/prisma";
import { runRetailPosting } from "@/lib/retail/posting-settings";

import { createProduct, openingJournal, openingOf } from "./create";
import { productInput } from "./input";
import { makeTestShop, type TestShop } from "./test-fixtures";

let shop: TestShop;

beforeAll(async () => {
  shop = await makeTestShop("Opening");
  await runAccountingSeedPack({ companyId: shop.companyId, mode: "APPLY" });
}, 60_000);

afterAll(async () => {
  if (!shop) return;
  await prisma.journalLine.deleteMany({ where: { entry: { companyId: shop.companyId } } });
  await prisma.journalEntry.deleteMany({ where: { companyId: shop.companyId } });
  await prisma.accountingIntegrationEvent.deleteMany({ where: { companyId: shop.companyId } });
  await destroyProvisionedTenant(shop.companyId);
});

/** What `POST /products` does: create in a transaction, then post after the commit. */
async function addAndPost(fields: Record<string, unknown>) {
  const actor = shop.owner();
  const created = await prisma.$transaction((tx) => createProduct(tx, { actor, input: productInput.parse(fields), source: "ADDED" }));
  const journal = openingJournal(openingOf(created), actor);
  if (journal) await postRetailJournal(journal);
  // The shop posts at the end of the day: Post now, as the Posting page does.
  await runRetailPosting(shop.companyId, "BY_HAND", actor);
  return created;
}

const entriesFor = (productId: string) =>
  prisma.journalEntry.findMany({
    where: { companyId: shop.companyId, sourceType: "RETAIL_OPENING_STOCK", sourceId: productId },
    include: { lines: { include: { account: { select: { code: true } } } } },
  });

describe("opening stock in the books", () => {
  it("posts Dr Stock and Cr Opening Balances at quantity × cost, balanced", async () => {
    const created = await addAndPost({ name: "Savanna Light 330ml", categoryId: shop.ciderId, price: "2.10", cost: "1.38", openingStock: "48" });
    const entries = await entriesFor(created.productId);
    expect(entries).toHaveLength(1);
    const lines = entries[0]!.lines.map((line) => ({ code: line.account.code, debit: line.debit, credit: line.credit }));
    expect(lines.find((line) => line.code === "1200")).toMatchObject({ debit: 66.24, credit: 0 });
    expect(lines.find((line) => line.code === "3100")).toMatchObject({ debit: 0, credit: 66.24 });
    const debits = lines.reduce((sum, line) => sum + line.debit, 0);
    const credits = lines.reduce((sum, line) => sum + line.credit, 0);
    expect(Math.round(debits * 100)).toBe(Math.round(credits * 100));
  });

  it("posts nothing without a cost", async () => {
    const created = await addAndPost({ name: "Ice 5kg bag", price: "3.00", openingStock: "10" });
    expect(await entriesFor(created.productId)).toHaveLength(0);
  });
});
