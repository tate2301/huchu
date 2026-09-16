import { fetchJson } from "@/lib/api-client";

/**
 * The library, from the browser's side.
 *
 * The two library screens grew up calling `fetchJson` inline, which was
 * survivable while everything they sent was `{ action, loanId }`. Correcting a
 * loan is not that shape: it is five fields, four of which mean something
 * different when they are absent than when they are null, and a component that
 * assembles its own body gets to decide that difference by accident. So the
 * request shape lives here, once, the way the rest of the module does it.
 *
 * As everywhere in `lib/schools`, `successResponse` does not wrap: this reads
 * the body directly rather than reaching for `.data.data`.
 */

export type LoanCorrection = {
  /** The reader it should have been against. */
  studentId?: string;
  /** The copy that actually went out. */
  copyId?: string;
  /** ISO. When the book is wanted back. */
  dueAt?: string;
  /** A number to reprice what is owed, `null` to waive it entirely. */
  fineAmount?: number | null;
  /** Why the slip was changed. `null` rubs the existing note out. */
  notes?: string | null;
};

/**
 * Put right a loan that was written down wrong.
 *
 * Distinct from renewing, and that distinction is the point: renewing spends
 * one of the reader's two renewals and moves the date by a fixed fortnight,
 * whereas this moves it to the day the librarian meant and costs the reader
 * nothing. Same for the borrower and the copy — a book scanned against its twin
 * on the trolley had no way back before this.
 *
 * Only the fields passed are written. Leaving one out means "do not touch it",
 * which is not the same as passing `null` on the two that can be rubbed out.
 */
export function correctLoan(loanId: string, input: LoanCorrection) {
  return fetchJson<{
    id: string;
    dueAt: string;
    studentId: string;
    copyId: string;
    fineAmount: number | null;
  }>("/api/v2/schools/library/loans", {
    method: "PATCH",
    body: JSON.stringify({ loanId, ...input }),
  });
}
