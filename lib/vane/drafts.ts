import { z } from "zod";

/**
 * Vane's drafts (`docs/vane.md`, "Drafts Vane writes"): an invoice, quotation
 * or purchase order Vane wrote is marked `madeByVane`, with no maker. It is
 * only ever a draft. Before it can be issued, sent or posted, a signed-in
 * person confirms it as theirs (`asMine` on the route that issues or sends
 * it), which records them as its maker in the same write. Every route that
 * issues, sends or posts one of these records asks `takeOn` first; without
 * `asMine` a draft no person has taken on is refused with 409.
 */

export type Authored = { madeByVane: boolean; createdById: string | null };

/** What the issue, send and post routes take: the person confirms Vane's draft as theirs. */
export const asMineSchema = z.boolean().optional();

/** A draft Vane wrote that no person has taken on yet. */
export function waitsForAPerson(record: Authored): boolean {
  return record.madeByVane && !record.createdById;
}

/** Refused: Vane's draft, not yet anybody's. The routes answer 409 with the message. */
export class VaneDraftNotTakenOn extends Error {
  readonly status = 409 as const;
  constructor(what: string, verb: string) {
    super(`${what} is Vane’s draft. Check it and confirm it as yours to ${verb} it.`);
    this.name = "VaneDraftNotTakenOn";
  }
}

/**
 * Before a record is issued, sent or posted: refused when it is Vane's draft
 * and the person has not confirmed it as theirs; otherwise the fields to
 * write with the change, which make them its maker when they confirm one.
 * Write the result in the same update as the issue or send.
 */
export function takeOn(
  record: Authored,
  { asMine, userId, what, verb }: { asMine?: boolean; userId: string; what: string; verb: string },
): { createdById?: string } {
  if (!waitsForAPerson(record)) return {};
  if (!asMine) throw new VaneDraftNotTakenOn(what, verb);
  return { createdById: userId };
}

const DAY_MS = 86_400_000;

/** Whole days from one date to another, by calendar day. */
export function daysBetween(from: Date, to: Date): number {
  const start = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  const end = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
  return Math.round((end - start) / DAY_MS);
}

/**
 * Vane's draft invoice is dated on issue and due its terms after it ("due 21
 * days after you issue it"): taken on at issue, its date becomes the day it
 * is issued and its due date moves with it, the same number of days on.
 */
export function datesOnIssue(draft: { invoiceDate: Date; dueDate: Date | null }, issuedOn: Date): { invoiceDate: Date; dueDate: Date | null } {
  const day = new Date(Date.UTC(issuedOn.getUTCFullYear(), issuedOn.getUTCMonth(), issuedOn.getUTCDate()));
  if (!draft.dueDate) return { invoiceDate: day, dueDate: null };
  const terms = Math.max(0, daysBetween(draft.invoiceDate, draft.dueDate));
  return { invoiceDate: day, dueDate: new Date(day.getTime() + terms * DAY_MS) };
}

/**
 * A customer's usual terms, in days: the most common gap between date and due
 * date on their issued invoices (the latest wins a tie). Null with none.
 */
export function usualTerms(invoices: Array<{ invoiceDate: Date; dueDate: Date | null }>): number | null {
  const counts = new Map<number, number>();
  for (const invoice of invoices) {
    if (!invoice.dueDate) continue;
    const days = daysBetween(invoice.invoiceDate, invoice.dueDate);
    if (days < 0) continue;
    counts.set(days, (counts.get(days) ?? 0) + 1);
  }
  let best: number | null = null;
  let most = 0;
  for (const [days, count] of counts) {
    if (count > most) {
      best = days;
      most = count;
    }
  }
  return best;
}
