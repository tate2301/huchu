/**
 * The outside accountant (design/books/spec/books.md, Roles): a member from the
 * firm that audits or keeps the books, with an access end date. In Books they
 * have the owner's rights until that day, the day itself included; every act
 * is marked as theirs (`auditActor`). Outside Books they are their role.
 */

export type OutsideAccountant = { firmName: string };

/** The day as the database keeps a DATE: midnight UTC. */
const dayOf = (at: Date) => at.toISOString().slice(0, 10);

/** Their access is open on `now` when the end date is that day or later. */
export function outsideAccessOpen(accessEndsOn: Date | null | undefined, now: Date = new Date()): boolean {
  return Boolean(accessEndsOn) && dayOf(accessEndsOn!) >= dayOf(now);
}

export const OUTSIDE_ACCESS_ENDED = "Your access as an outside accountant has ended. Ask the owner to extend it.";
