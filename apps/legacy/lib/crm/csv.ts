/**
 * CSV reading for CRM imports.
 *
 * The reader itself moved to lib/import-core/csv.ts when the schools importer
 * needed the same one. Re-exported here so every existing CRM caller keeps its
 * import path.
 */
export {
  parseCsv,
  normalizeHeader,
  guessMapping,
  rowToRecord,
  type CsvTable,
} from "@/lib/import-core/csv";
