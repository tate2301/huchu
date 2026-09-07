/**
 * CSV reading for imports.
 *
 * Written as a character walk rather than a line split because real exports
 * put newlines inside quoted address fields, and a line-based reader turns one
 * customer into three broken ones without saying anything went wrong.
 *
 * Lifted verbatim out of lib/crm/csv.ts when the schools importer needed the
 * same reader — a spreadsheet a school exports from its old system has the same
 * quoted-newline problem in its address column that a CRM export does, and two
 * copies of a tokenizer diverge the first time one of them is fixed.
 */
export type CsvTable = {
  headers: string[];
  rows: string[][];
};

/** Parse a whole CSV document, honouring quotes, escaped quotes and CRLF. */
export function parseCsv(text: string): CsvTable {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let sawAnyChar = false;

  // A byte-order mark at the front of an Excel export otherwise becomes part
  // of the first column name, and nothing ever maps to it.
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  const endField = () => {
    row.push(field.trim());
    field = "";
  };
  const endRow = () => {
    endField();
    // A trailing newline shouldn't add a row of one empty string.
    if (row.length > 1 || row[0] !== "") rows.push(row);
    row = [];
  };

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    sawAnyChar = true;

    if (inQuotes) {
      if (char === '"') {
        if (source[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') inQuotes = true;
    else if (char === ",") endField();
    else if (char === "\r") continue;
    else if (char === "\n") endRow();
    else field += char;
  }

  if (sawAnyChar) endRow();

  const [headers = [], ...body] = rows;
  return { headers, rows: body };
}

/** Loose header matching, so "Full Name", "full_name" and "fullname" agree. */
export function normalizeHeader(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Guess which column feeds which field.
 *
 * A guess is only ever a starting point — the mapping step shows every column
 * and lets it be changed, because a wrong guess applied silently is worse than
 * no guess at all.
 */
export function guessMapping(
  headers: string[],
  fields: { key: string; label: string; aliases?: string[] }[],
): Record<string, string> {
  const mapping: Record<string, string> = {};
  const taken = new Set<string>();

  for (const field of fields) {
    const candidates = [field.key, field.label, ...(field.aliases ?? [])].map(normalizeHeader);
    const index = headers.findIndex(
      (header, position) =>
        !taken.has(String(position)) && candidates.includes(normalizeHeader(header)),
    );
    if (index >= 0) {
      mapping[field.key] = headers[index];
      taken.add(String(index));
    }
  }

  return mapping;
}

/** Turn a row of cells into an object keyed by field, using the mapping. */
export function rowToRecord(
  headers: string[],
  row: string[],
  mapping: Record<string, string>,
): Record<string, string> {
  const byHeader = new Map(headers.map((header, index) => [header, row[index] ?? ""]));
  const record: Record<string, string> = {};
  for (const [field, header] of Object.entries(mapping)) {
    if (!header) continue;
    const value = byHeader.get(header);
    if (value !== undefined && value !== "") record[field] = value;
  }
  return record;
}
