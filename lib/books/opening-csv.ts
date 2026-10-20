type Line = { accountId: string; debit: string; credit: string };

/**
 * Rows of a trial balance as a CSV, matched to the chart by code: "code,
 * debit, credit" or "code, name, debit, credit", a header row allowed. Pure.
 */
export function parseTrialBalanceCsv(text: string, accounts: Array<{ id: string; code: string }>): { lines: Line[]; unknown: string[] } {
  const byCode = new Map(accounts.map((account) => [account.code.trim().toUpperCase(), account.id]));
  const lines: Line[] = [];
  const unknown: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const cells = raw.split(",").map((cell) => cell.trim().replace(/^"|"$/g, ""));
    if (cells.length < 3 || !cells[0]) continue;
    const [code, ...rest] = cells;
    const [debit, credit] = rest.length >= 3 ? [rest[1], rest[2]] : [rest[0], rest[1]];
    if (!/\d/.test(`${debit}${credit}`)) continue;
    const id = byCode.get(code.toUpperCase());
    if (!id) {
      unknown.push(code);
      continue;
    }
    lines.push({ accountId: id, debit: debit ?? "", credit: credit ?? "" });
  }
  return { lines, unknown };
}
