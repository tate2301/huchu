import type { RetailAuditActor } from "@/lib/retail/audit";

import { commitImport, type PostJournal } from "./commit";
import type { ParsedRow } from "./parse";
import { createImport } from "./store";
import type { CommitStep } from "./words";

/** Test setup only: an import made from rows, as an upload makes one. */
export async function importRows(
  actor: RetailAuditActor,
  fileName: string,
  rows: Array<Partial<Omit<ParsedRow, "rowNo">> & { rowNo: number }>,
): Promise<string> {
  const parsed: ParsedRow[] = rows.map((row) => ({
    name: null,
    category: null,
    price: null,
    barcode: null,
    cost: null,
    supplier: null,
    packSize: null,
    openingStock: null,
    ...row,
  }));
  return (await createImport(actor, fileName, parsed)).id;
}

/** Test setup only: commit calls until nothing is left, as the page makes them; answers the last and how many calls it took. */
export async function commitAll(
  actor: RetailAuditActor,
  importId: string,
  post: PostJournal,
): Promise<CommitStep & { calls: number }> {
  for (let calls = 1; ; calls += 1) {
    const step = await commitImport(actor, importId, post);
    if (step.left === 0) return { ...step, calls };
  }
}
