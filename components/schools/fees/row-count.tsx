"use client";

/**
 * How many rows the narrowing left, out of how many there are.
 *
 * It sits beside the filters rather than in the page band, and that is the
 * band's own law read the other way round: the band carries state — what the
 * school owes, how many bills are unpaid — and those do not move when you
 * type. This number is the answer to whatever the filters just asked, so it
 * belongs next to the question.
 *
 * `TableControls` renders its own `count` slot exactly like this. The fee
 * tables carry their controls in `DataTable`'s toolbar instead, so they need
 * somewhere to say it from — but there is one of those places, not six, and it
 * says it in the same words and the same face as every other register in the
 * product: `50 of 214`.
 *
 * `8 of 8` rather than `8` where nothing is narrowing: the second number is
 * what makes the first one mean anything, and dropping it when the two agree
 * makes the control change shape as the reader types. There is no bare-number
 * form for that reason — a caller with no total to give has no answer yet, not
 * an answer that happens to be undivided.
 *
 * While the query is still out there is no answer yet, and an em dash says so.
 * A literal `0 of 0` for the frame before the rows land is a figure a bursar
 * can read and act on, and it is wrong.
 *
 * Hidden below `sm`, where the filters themselves are behind a button and the
 * screen is wanted for rows.
 */
export function RowCount({
  showing,
  total,
  pending,
}: {
  /** Rows on screen after the filters. */
  showing: number;
  /**
   * Rows the query would return unnarrowed — the denominator, never omitted to
   * make the control shorter. Absent only while there is no answer, which is
   * the same state `pending` describes and is rendered the same way.
   */
  total?: number;
  /** The query behind `showing` has not answered yet. */
  pending?: boolean;
}) {
  return (
    <span className="hidden shrink-0 self-center font-mono text-xs tabular-nums text-[color:var(--text-subtle)] sm:inline">
      {pending || total === undefined ? "—" : `${showing} of ${total}`}
    </span>
  );
}
