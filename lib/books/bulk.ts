/**
 * A move made on every row of a selection, one at a time, each through its
 * own route: what was done, and what was skipped with why (books-final
 * §5.13). Never stops at the first refusal. No database here.
 */
export type BulkOutcome = { done: string[]; skipped: Array<{ label: string; why: string }> };

export async function eachOf<T>(rows: T[], label: (row: T) => string, run: (row: T) => Promise<unknown>, why: (error: unknown) => string): Promise<BulkOutcome> {
  const outcome: BulkOutcome = { done: [], skipped: [] };
  for (const row of rows) {
    try {
      await run(row);
      outcome.done.push(label(row));
    } catch (error) {
      outcome.skipped.push({ label: label(row), why: why(error) });
    }
  }
  return outcome;
}

/** The toast's words: "2 requisitions approved" and "Skipped REQ-0093: Somebody else has to approve your own request." */
export function bulkWords(outcome: BulkOutcome, verb: string, noun: [string, string]): { title: string; description?: string; ok: boolean } {
  const n = outcome.done.length;
  const title = n === 0 ? `Nothing was ${verb}` : n === 1 ? `${outcome.done[0]} ${verb}` : `${n} ${noun[1]} ${verb}`;
  const description = outcome.skipped.length ? outcome.skipped.map((skip) => `Skipped ${skip.label}: ${/[.!?]$/.test(skip.why) ? skip.why : `${skip.why}.`}`).join(" ") : undefined;
  return { title, description, ok: n > 0 };
}
