import { Prisma, type RetailImportProblem } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import type { RetailAuditActor } from "@/lib/retail/audit";
import { categoryPath } from "@/lib/retail/category-words";
import { stockSiteOf } from "@/lib/retail/products/create";

import { catalogIndex } from "./match";
import type { ParsedRow } from "./parse";
import { ImportRefusal } from "./refusal";
import { categoryKey, checkRows, type CheckContext, type Checked } from "./validate";
import {
  NOT_CHECKING,
  NOT_FOUND,
  problemView,
  type ImportCounts,
  type ImportPage,
  type ImportRow,
  type ImportRowArgs,
  type ImportTab,
} from "./words";

/**
 * An import while it is being checked (SET-11, 10-setup 4.11): made from a
 * parsed file, read a tab at a time, a row's cells edited, thrown away. Every
 * change checks the whole file again, since a category made or a barcode
 * changed on one row can clear or flag others.
 */

type Tx = Prisma.TransactionClient;

const rowSelect = {
  id: true,
  rowNo: true,
  name: true,
  category: true,
  price: true,
  barcode: true,
  cost: true,
  supplier: true,
  packSize: true,
  openingStock: true,
  action: true,
  matchedProductId: true,
  problems: true,
  problemArgs: true,
} satisfies Prisma.RetailImportRowSelect;

export type StoredRow = Prisma.RetailImportRowGetPayload<{ select: typeof rowSelect }>;

export const argsOf = (row: { problemArgs: Prisma.JsonValue | null }): ImportRowArgs =>
  row.problemArgs && typeof row.problemArgs === "object" && !Array.isArray(row.problemArgs) ? (row.problemArgs as ImportRowArgs) : {};

/** The shop's live categories and products, as the checks read them. */
export async function checkContext(tx: Tx | typeof prisma, companyId: string): Promise<CheckContext> {
  const [categories, products] = await Promise.all([
    tx.retailCategory.findMany({
      where: { companyId, archivedAt: null },
      select: { name: true, parent: { select: { name: true } } },
    }),
    tx.product.findMany({
      where: { companyId, archivedAt: null },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, barcode: true },
    }),
  ]);
  const names = new Set<string>();
  for (const category of categories) {
    names.add(categoryKey(category.name));
    names.add(categoryKey(categoryPath(category)));
  }
  return { categories: names, catalog: catalogIndex(products) };
}

export function rowView(row: StoredRow): ImportRow {
  const args = argsOf(row);
  return {
    id: row.id,
    rowNo: row.rowNo,
    name: row.name ?? "",
    category: row.category ?? "",
    price: row.price ?? "",
    barcode: row.barcode ?? "",
    problem: problemView(row.problems, args),
    action: row.action,
    matchedName: args.matchedName ?? null,
  };
}

export function countsOf(rows: Array<{ problems: RetailImportProblem[]; action: string | null }>): ImportCounts {
  const counts: ImportCounts = { fix: 0, new: 0, update: 0, all: rows.length };
  for (const row of rows) {
    if (row.problems.length > 0) counts.fix += 1;
    else if (row.action === "UPDATE") counts.update += 1;
    else counts.new += 1;
  }
  return counts;
}

const inTab = (tab: ImportTab) => (row: { problems: RetailImportProblem[]; action: string | null }) => {
  if (tab === "all") return true;
  if (tab === "fix") return row.problems.length > 0;
  if (row.problems.length > 0) return false;
  return tab === "update" ? row.action === "UPDATE" : row.action !== "UPDATE";
};

/** Make an import from a parsed file: every row stored as typed, checked and matched. */
export async function createImport(actor: RetailAuditActor, fileName: string, parsed: ParsedRow[]): Promise<{ id: string }> {
  return prisma.$transaction(
    async (tx) => {
      const site = await stockSiteOf(tx, actor.companyId, null);
      const ctx = await checkContext(tx, actor.companyId);
      const checked = checkRows(parsed, ctx);
      const created = await tx.retailImport.create({
        data: { companyId: actor.companyId, fileName, rowCount: parsed.length, siteId: site.id, createdById: actor.userId },
        select: { id: true },
      });
      const data = parsed.map((row, index) => {
        const check = checked[index]!;
        return {
          importId: created.id,
          ...row,
          action: check.action,
          matchedProductId: check.matchedProductId,
          problems: check.problems,
          problemArgs: check.args as Prisma.InputJsonValue,
        };
      });
      for (let start = 0; start < data.length; start += 1_000) {
        await tx.retailImportRow.createMany({ data: data.slice(start, start + 1_000) });
      }
      return created;
    },
    { timeout: 60_000 },
  );
}

/** The import, locked for the rest of the transaction, or a refusal. */
export async function lockImport(tx: Tx, companyId: string, id: string, needChecking = true) {
  const [locked] = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "RetailImport" WHERE "id" = ${id} AND "companyId" = ${companyId} FOR UPDATE`;
  if (!locked) throw new ImportRefusal(404, NOT_FOUND);
  const found = await tx.retailImport.findUniqueOrThrow({
    where: { id },
    select: { id: true, fileName: true, rowCount: true, status: true, siteId: true },
  });
  if (needChecking && found.status !== "CHECKING") throw new ImportRefusal(409, NOT_CHECKING);
  return found;
}

const same = (stored: StoredRow, check: Checked) =>
  stored.action === check.action &&
  stored.matchedProductId === check.matchedProductId &&
  stored.problems.join() === check.problems.join() &&
  JSON.stringify(argsOf(stored)) === JSON.stringify(check.args);

/**
 * Check every row of an import again, against the shop as it is now. Writes
 * only the rows whose result changed; returns every row and the ids changed.
 */
export async function recheck(tx: Tx, companyId: string, importId: string): Promise<{ rows: StoredRow[]; changed: Set<string> }> {
  const rows = await tx.retailImportRow.findMany({ where: { importId }, orderBy: { rowNo: "asc" }, select: rowSelect });
  const ctx = await checkContext(tx, companyId);
  const checked = checkRows(
    rows.map((row) => ({ ...row, acceptedMatchId: argsOf(row).acceptedMatchId ?? null })),
    ctx,
  );
  const changed = new Set<string>();
  const next = rows.map((row, index) => {
    const check = checked[index]!;
    if (same(row, check)) return row;
    changed.add(row.id);
    return { ...row, action: check.action, matchedProductId: check.matchedProductId, problems: check.problems, problemArgs: check.args as Prisma.JsonValue };
  });
  for (const row of next) {
    if (!changed.has(row.id)) continue;
    await tx.retailImportRow.update({
      where: { id: row.id },
      data: {
        action: row.action,
        matchedProductId: row.matchedProductId,
        problems: row.problems,
        problemArgs: (row.problemArgs ?? Prisma.JsonNull) as Prisma.InputJsonValue,
      },
    });
  }
  return { rows: next, changed };
}

export async function loadImportPage(companyId: string, id: string, tab: ImportTab): Promise<ImportPage | null> {
  const found = await prisma.retailImport.findFirst({
    where: { id, companyId },
    select: { id: true, fileName: true, rowCount: true, status: true, site: { select: { name: true } } },
  });
  if (!found) return null;
  const rows = await prisma.retailImportRow.findMany({ where: { importId: id }, orderBy: { rowNo: "asc" }, select: rowSelect });
  return {
    id: found.id,
    fileName: found.fileName,
    rowCount: found.rowCount,
    status: found.status,
    siteName: found.site.name,
    counts: countsOf(rows),
    rows: rows.filter(inTab(tab)).map(rowView),
  };
}

export type RowEdit = { name?: string | null; category?: string | null; price?: string | null; barcode?: string | null };

/** Change a row's cells as typed, then check the file again. */
export async function editRow(
  companyId: string,
  importId: string,
  rowId: string,
  edit: RowEdit,
): Promise<{ row: ImportRow; counts: ImportCounts }> {
  return prisma.$transaction(
    async (tx) => {
      await lockImport(tx, companyId, importId);
      const row = await tx.retailImportRow.findFirst({ where: { id: rowId, importId }, select: { id: true } });
      if (!row) throw new ImportRefusal(404, "That row is not in this import.");
      const data: Prisma.RetailImportRowUpdateInput = {};
      for (const key of ["name", "category", "price", "barcode"] as const) {
        if (edit[key] === undefined) continue;
        const text = edit[key]?.trim() ?? "";
        data[key] = text === "" ? null : text;
      }
      await tx.retailImportRow.update({ where: { id: rowId }, data });
      const { rows } = await recheck(tx, companyId, importId);
      return { row: rowView(rows.find((stored) => stored.id === rowId)!), counts: countsOf(rows) };
    },
    { timeout: 60_000 },
  );
}

/** "Start again": the import is thrown away and its rows go. One already imported stays. */
export async function discardImport(companyId: string, importId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const found = await lockImport(tx, companyId, importId, false);
    if (found.status === "IMPORTED") throw new ImportRefusal(409, "This import is already in Products.");
    await tx.retailImportRow.deleteMany({ where: { importId } });
    await tx.retailImport.update({ where: { id: importId }, data: { status: "DISCARDED" } });
  });
}
