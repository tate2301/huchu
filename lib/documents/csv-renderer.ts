function escapeCsvValue(value: unknown): string {
  const text = String(value ?? "");
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function renderCsv(rows: Array<Record<string, unknown>>, columns?: string[]): string {
  if (rows.length === 0) {
    return "";
  }

  const keys = columns && columns.length > 0 ? columns : Object.keys(rows[0]);
  const header = keys.map((key) => escapeCsvValue(key)).join(",");
  const body = rows
    .map((row) => keys.map((key) => escapeCsvValue(row[key])).join(","))
    .join("\n");

  return `${header}\n${body}`;
}
