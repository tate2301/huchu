import { Prisma } from "@prisma/client";

import { money } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { getApprovalLimits, type ApprovalLimits } from "@/lib/retail/approvals/limits";
import { RETAIL_AUDIT_EVENTS, writeRetailAuditEvent, type RetailAuditActor } from "@/lib/retail/audit";
import { categoryPath } from "@/lib/retail/category-words";
import { changePrices, defaultPriceList, PriceRefusal } from "@/lib/retail/prices/change";
import {
  checkProductUnique,
  createProduct,
  openingJournal,
  openingOf,
  ProductRefusal,
  type OpeningPosting,
} from "@/lib/retail/products/create";
import { productInput } from "@/lib/retail/products/input";

import { ImportRefusal } from "./refusal";
import { argsOf, lockImport, type StoredRow } from "./store";
import { categoryKey, goodBarcode } from "./validate";
import type { ImportRowArgs } from "./words";

/**
 * Import the rows that are ready (SET-11, 10-setup W-08 6). Rows that still
 * need a fix are skipped. The rest go in transactions of 200, each all or
 * nothing, and each row is marked done in the transaction that did it, so a
 * retry after a failed batch picks up where it stopped and never adds a
 * product twice.
 *
 * - A new row is New product's own create (PRD-03): on sale at once at the
 *   import's site, on the default list with its IMPORT history row, cost and
 *   supplier when given (a supplier the shop does not have is left out), and
 *   opening stock as an OPENING receipt. A pack size of 2 or more makes it a
 *   case of the single named as the row without its pack words.
 * - A row that matched updates that product: its cost (and its stock line's
 *   cost at the import's site) and barcode when given, then its price through
 *   the price-change core, which keeps the old price in its history and asks
 *   the owner rule.
 * - A row the shop's rules refuse (a manager's price below cost, a name or
 *   barcode another product took meanwhile) is skipped and counted.
 *
 * Opening stock posts Dr Stock / Cr Opening balances after each batch commits,
 * at quantity × cost; a row without a cost posts nothing.
 */

type Tx = Prisma.TransactionClient;

export const BATCH = 200;

export type CommitResult = { created: number; updated: number; skipped: number };

/** "Castle Lager 340ml case of 24" → "Castle Lager 340ml"; null when the name carries no pack words. */
export function singleName(name: string): string | null {
  const patterns = [/,?\s+case of \d+$/i, /\s+x\s?\d+$/i, /\s+\d+\s?-?pack$/i];
  for (const pattern of patterns) {
    if (pattern.test(name)) return name.replace(pattern, "").trim() || null;
  }
  return null;
}

const packSizeOf = (row: StoredRow): number | null => {
  const size = row.packSize?.trim();
  if (!size || !/^\d+$/.test(size)) return null;
  const n = Number(size);
  return n >= 2 ? n : null;
};

async function markDone(tx: Tx, row: StoredRow, args: ImportRowArgs) {
  await tx.retailImportRow.update({ where: { id: row.id }, data: { problemArgs: { ...argsOf(row), ...args } } });
}

/** One row inside a savepoint: a refusal undoes the row alone and marks it skipped. */
async function oneRow(tx: Tx, row: StoredRow, work: () => Promise<ImportRowArgs>) {
  await tx.$executeRawUnsafe(`SAVEPOINT import_row`);
  try {
    const done = await work();
    await tx.$executeRawUnsafe(`RELEASE SAVEPOINT import_row`);
    await markDone(tx, row, done);
  } catch (error) {
    if (!(error instanceof ProductRefusal || error instanceof PriceRefusal)) throw error;
    await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT import_row`);
    await markDone(tx, row, { done: "SKIPPED", note: error.message });
  }
}

async function addRow(
  tx: Tx,
  ctx: { actor: RetailAuditActor; siteId: string; limits: ApprovalLimits; categories: Map<string, string> },
  row: StoredRow,
  openings: OpeningPosting[],
): Promise<ImportRowArgs> {
  const supplier = row.supplier?.trim()
    ? await tx.vendor.findFirst({
        where: { companyId: ctx.actor.companyId, isActive: true, name: { equals: row.supplier.trim(), mode: "insensitive" } },
        select: { id: true },
      })
    : null;
  const parsed = productInput.safeParse({
    name: row.name,
    price: row.price,
    categoryId: row.category ? (ctx.categories.get(categoryKey(row.category)) ?? null) : null,
    barcode: row.barcode,
    cost: row.cost,
    supplierId: supplier?.id ?? null,
    openingStock: row.openingStock,
  });
  if (!parsed.success) {
    throw new ProductRefusal(400, parsed.error.issues[0]?.message ?? "This row could not be read.");
  }
  const created = await createProduct(tx, {
    actor: ctx.actor,
    input: parsed.data,
    source: "IMPORT",
    siteId: ctx.siteId,
    limits: ctx.limits,
  });
  const opening = openingOf(created);
  if (opening) openings.push(opening);

  const size = packSizeOf(row);
  let note: string | null = null;
  if (size) {
    const single = singleName(created.name);
    const found = single
      ? await tx.product.findFirst({
          where: { companyId: ctx.actor.companyId, archivedAt: null, id: { not: created.productId }, name: { equals: single, mode: "insensitive" } },
          select: { id: true },
        })
      : null;
    if (found) await tx.product.update({ where: { id: created.productId }, data: { packOfId: found.id, packSize: size } });
    else note = `No single called ${single ?? created.name} in Products, so it was imported as an ordinary product.`;
  }
  return { done: "NEW", productId: created.productId, note };
}

async function updateRow(
  tx: Tx,
  ctx: { actor: RetailAuditActor; siteId: string; limits: ApprovalLimits; listId: string },
  row: StoredRow,
): Promise<ImportRowArgs> {
  const productId = row.matchedProductId!;
  const companyId = ctx.actor.companyId;
  const product = await tx.product.findFirst({ where: { id: productId, companyId, archivedAt: null }, select: { id: true } });
  if (!product) throw new ProductRefusal(400, "That product has gone from Products since the file was checked.");

  const data: Prisma.ProductUpdateInput = {};
  const barcode = goodBarcode(row.barcode);
  if (barcode) {
    await checkProductUnique(tx, companyId, { barcode }, productId);
    data.barcode = barcode;
  }
  if (row.cost?.trim()) {
    const cost = productInput.shape.cost.safeParse(row.cost);
    if (!cost.success || !cost.data) throw new ProductRefusal(400, "Write the cost as a figure, like 2.10.");
    data.costPrice = money(cost.data);
    await tx.inventoryItem.updateMany({ where: { productId, siteId: ctx.siteId }, data: { unitCost: money(cost.data) } });
  }
  if (Object.keys(data).length > 0) await tx.product.update({ where: { id: productId }, data });

  await changePrices(tx, {
    companyId,
    actor: ctx.actor,
    listId: ctx.listId,
    rows: [{ productId, price: row.price!.trim() }],
    source: "IMPORT",
    limits: ctx.limits,
  });
  return { done: "UPDATE", productId };
}

/** How the opening stock's journal goes to the books: the retail routes' `postRetailJournal`, as New product's. */
export type PostJournal = (journal: NonNullable<ReturnType<typeof openingJournal>>) => Promise<unknown>;

async function postOpenings(actor: RetailAuditActor, openings: OpeningPosting[], post: PostJournal) {
  for (const opening of openings) {
    const journal = openingJournal(opening, actor);
    if (!journal) continue;
    try {
      await post(journal);
    } catch (error) {
      // The integration event is written before it posts, so the posting run picks it up.
      console.error(`[import] opening stock for ${opening.code} did not post:`, error);
    }
  }
}

export async function commitImport(actor: RetailAuditActor, importId: string, post: PostJournal): Promise<CommitResult> {
  const found = await prisma.retailImport.findFirst({
    where: { id: importId, companyId: actor.companyId },
    select: { status: true, siteId: true, fileName: true },
  });
  if (!found) throw new ImportRefusal(404, "Import not found");
  if (found.status !== "CHECKING") throw new ImportRefusal(409, "This import is not waiting to be checked.");

  const limits = await getApprovalLimits(actor.companyId);
  const list = await defaultPriceList(prisma, actor.companyId);
  const categoryRows = await prisma.retailCategory.findMany({
    where: { companyId: actor.companyId, archivedAt: null },
    select: { id: true, name: true, parent: { select: { name: true } } },
  });
  const categories = new Map<string, string>();
  for (const category of categoryRows) {
    categories.set(categoryKey(categoryPath(category)), category.id);
    if (!categories.has(categoryKey(category.name))) categories.set(categoryKey(category.name), category.id);
  }

  const rows = await prisma.retailImportRow.findMany({
    where: { importId, problems: { isEmpty: true } },
    orderBy: { rowNo: "asc" },
  });
  // Singles before cases, so a case finds the single it holds even when both are in the file.
  const ready = rows
    .filter((row) => !argsOf(row).done)
    .sort((a, b) => Number(packSizeOf(a) !== null) - Number(packSizeOf(b) !== null) || a.rowNo - b.rowNo);
  const ctx = { actor, siteId: found.siteId, limits, categories, listId: list.id };

  for (let start = 0; start < ready.length; start += BATCH) {
    const batch = ready.slice(start, start + BATCH);
    const openings: OpeningPosting[] = [];
    await prisma.$transaction(
      async (tx) => {
        await lockImport(tx, actor.companyId, importId);
        const fresh = await tx.retailImportRow.findMany({ where: { id: { in: batch.map((row) => row.id) } } });
        const byId = new Map(fresh.map((row) => [row.id, row]));
        for (const planned of batch) {
          const row = byId.get(planned.id);
          // Done by an earlier try, or changed since: leave it to its own run.
          if (!row || argsOf(row).done || row.problems.length > 0) continue;
          await oneRow(tx, row, () => (row.action === "UPDATE" ? updateRow(tx, ctx, row) : addRow(tx, ctx, row, openings)));
        }
      },
      { timeout: 120_000 },
    );
    await postOpenings(actor, openings, post);
  }

  return prisma.$transaction(async (tx) => {
    const locked = await lockImport(tx, actor.companyId, importId);
    const all = await tx.retailImportRow.findMany({ where: { importId }, select: { problemArgs: true } });
    const created = all.filter((row) => argsOf(row).done === "NEW").length;
    const updated = all.filter((row) => argsOf(row).done === "UPDATE").length;
    const skipped = locked.rowCount - created - updated;
    await tx.retailImport.update({
      where: { id: importId },
      data: {
        status: "IMPORTED",
        importedAt: new Date(),
        importedById: actor.userId,
        createdCount: created,
        updatedCount: updated,
        skippedCount: skipped,
      },
    });
    await writeRetailAuditEvent(tx, {
      actor,
      eventType: RETAIL_AUDIT_EVENTS.productsImported,
      entityType: "RetailImport",
      entityId: importId,
      payload: { created, updated, skipped, file: locked.fileName },
    });
    return { created, updated, skipped };
  });
}
