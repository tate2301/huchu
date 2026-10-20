/**
 * The parts every Books record page draws (BkInvoice, BkBill, BkRequisition,
 * BkSupplier): what it posted, line by line, and its history. Pure: the record
 * readers fill them, the views draw them.
 */

import { asOf, dayOf, shortDay, storedDay } from "./format";

/** Each ledger line, the entry's number and date on its first line only. */
export type PostingRow = { entry: string; date: string; account: string; debit: number | null; credit: number | null };

/** Newest first. tone: "" drafted, "in" recorded or sent, "ok" approved or paid, "wa" late, sent back or voided. */
export type HistoryItem = { tone: "" | "in" | "ok" | "wa"; text: string; when: string };

/**
 * The people a record names, by name, with their photo or null (owner, 19 Oct:
 * every person shows an avatar beside their name). History lines that start
 * with one of these names lead with that person's avatar.
 */
export type Faces = Record<string, string | null>;

export function facesOf(...people: Array<{ name: string | null; image?: string | null } | null | undefined>): Faces {
  const faces: Faces = {};
  for (const person of people) if (person?.name && !(person.name in faces && faces[person.name])) faces[person.name] = person.image ?? null;
  return faces;
}

const round = (n: number) => Math.round(n * 100) / 100;

type Entry = { entryNumber: number; entryDate: Date; lines: Array<{ debit: number; credit: number; account: { code: string; name: string } }> };

/** The entries as the Posting table lists them: debits first in each, "JE-0467" once. `party` follows the payables line ("2000 … · Mutare Timber Works"). */
export function postingRows(entries: Entry[], party?: { code: string; name: string } | null): PostingRow[] {
  return entries.flatMap((entry) =>
    entry.lines
      .filter((line) => line.debit > 0.004 || line.credit > 0.004)
      .sort((a, b) => b.debit - a.debit)
      .map((line, index) => ({
        entry: index === 0 ? `JE-${String(entry.entryNumber).padStart(4, "0")}` : "",
        date: index === 0 ? shortDay(storedDay(entry.entryDate)) : "",
        account: `${line.account.code} ${line.account.name}${party && line.account.code === party.code ? ` · ${party.name}` : ""}`,
        debit: line.debit > 0.004 ? round(line.debit) : null,
        credit: line.credit > 0.004 ? round(line.credit) : null,
      })),
  );
}

/** "13 Oct 11:40": a history line's time, as the boards write it. */
export function historyWhen(value: Date, now = new Date()): string {
  return asOf(value, now).replace(/^(Today|Yesterday) /, `${shortDay(dayOf(value))} `);
}

/** History, newest first, from items that each carry the instant they happened. */
export function historyOf(items: Array<HistoryItem & { at: Date }>): HistoryItem[] {
  return [...items].sort((a, b) => b.at.getTime() - a.at.getTime()).map(({ tone, text, when }) => ({ tone, text, when }));
}
