/** Rows as a CSV file's text, quoted where a cell needs it. Pure. */
export function toCsv(head: string[], rows: Array<Array<string | number | null | undefined>>): string {
  const cell = (value: string | number | null | undefined) => {
    const text = value === null || value === undefined ? "" : typeof value === "number" ? value.toFixed(2) : value;
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return `${[head, ...rows].map((row) => row.map(cell).join(",")).join("\n")}\n`;
}
