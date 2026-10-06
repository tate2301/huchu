import type { RetailAuditActor } from "@/lib/retail/audit";

import type { ParsedRow } from "./parse";
import { createImport } from "./store";

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
