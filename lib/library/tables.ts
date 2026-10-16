import { REPORT_DEFINITIONS } from "@/lib/reports/registry";
import { sourceTable, type SqlTable } from "@/lib/reports/sql/schema";

/**
 * What a library item's SQL may read: every report source there is, as a
 * table. Corelith writes for many workspaces at once, so an item is checked
 * against all of them here; which ones a workspace reads is decided where it
 * opens there, and an item reading one it does not is not offered to it.
 */

let tables: SqlTable[] | null = null;
let names: Set<string> | null = null;

export function libraryTables(): readonly SqlTable[] {
  tables ??= REPORT_DEFINITIONS.map(sourceTable);
  return tables;
}

export function libraryTableNames(): ReadonlySet<string> {
  names ??= new Set(libraryTables().map((table) => table.name));
  return names;
}
