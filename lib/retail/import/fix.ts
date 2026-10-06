import { prisma } from "@/lib/prisma";
import type { RetailAuditActor } from "@/lib/retail/audit";
import { CategoryRefusal, createCategory } from "@/lib/retail/categories";

import { ImportRefusal } from "./refusal";
import { argsOf, countsOf, lockImport, recheck, rowView } from "./store";
import type { ImportCounts, ImportFix, ImportRow } from "./words";

/**
 * The fix buttons on a flagged row (SET-11, 10-setup W-08 5).
 *
 * "Create the category" adds the row's category to the shop — standard VAT
 * (zero-rated when the shop is not VAT registered), no 18+ check, sorted
 * last — through the categories' own create, so it is audited as any new
 * category is; then every row of the import naming it is checked again.
 *
 * "Update that one" tells the row to update the product it looks like.
 *
 * Answers every row the fix changed, and the tab counts.
 */
export async function applyFix(
  actor: RetailAuditActor,
  importId: string,
  input: { rowId: string; fix: ImportFix },
): Promise<{ rows: ImportRow[]; counts: ImportCounts }> {
  const row = await prisma.retailImportRow.findFirst({
    where: { id: input.rowId, importId, import: { companyId: actor.companyId } },
    select: { id: true, category: true, problems: true, matchedProductId: true, problemArgs: true, import: { select: { status: true } } },
  });
  if (!row) throw new ImportRefusal(404, "That row is not in this import.");
  if (row.import.status !== "CHECKING") throw new ImportRefusal(409, "This import is not waiting to be checked.");

  if (input.fix === "CREATE_CATEGORY") {
    if (!row.problems.includes("NEW_CATEGORY") || !row.category?.trim()) {
      throw new ImportRefusal(400, "This row names no new category.");
    }
    const profile = await prisma.retailShopProfile.findUnique({ where: { companyId: actor.companyId }, select: { vatRegistered: true } });
    try {
      await createCategory(actor, {
        name: row.category.trim().replace(/\s+/g, " "),
        vat: (profile?.vatRegistered ?? true) ? "STANDARD" : "ZERO_RATED",
        ageCheck: false,
        returnable: false,
      });
    } catch (error) {
      // Made meanwhile, by someone else or another row: checking again clears it all the same.
      if (!(error instanceof CategoryRefusal) || error.status !== 409) {
        throw error instanceof CategoryRefusal ? new ImportRefusal(400, error.message) : error;
      }
    }
  } else {
    if (!row.problems.includes("LOOKS_LIKE") || !row.matchedProductId) {
      throw new ImportRefusal(400, "This row does not look like another product.");
    }
  }

  return prisma.$transaction(
    async (tx) => {
      await lockImport(tx, actor.companyId, importId);
      if (input.fix === "UPDATE_MATCH") {
        await tx.retailImportRow.update({
          where: { id: row.id },
          data: { problemArgs: { ...argsOf(row), acceptedMatchId: row.matchedProductId } },
        });
      }
      const { rows, changed } = await recheck(tx, actor.companyId, importId);
      return { rows: rows.filter((stored) => changed.has(stored.id) || stored.id === row.id).map(rowView), counts: countsOf(rows) };
    },
    { timeout: 60_000 },
  );
}
