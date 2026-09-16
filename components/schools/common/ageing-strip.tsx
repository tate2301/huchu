"use client";

import { Breakdown, type BreakdownRow } from "@/components/ui/breakdown-panel";
import { ageingBands, type AgeingAmounts } from "@/lib/schools/ageing";
import { formatSchoolMoney } from "@/lib/schools/format";

/**
 * How old the money owed is, as one labelled bar per band.
 *
 * The overview, the arrears report and the dashboard all ask the same
 * question, so they ask it with the same picture and the same words:
 * `lib/schools/ageing.ts` owns the bands, this owns how they are drawn.
 *
 * A bar list rather than an axis chart, for the reason the accounting
 * receivables hub gives: an ageing report is read to the dollar — which band,
 * how much — and you cannot read $3,920 off a bar. The figure is text and the
 * bar is only there to make the shape scannable.
 */
export function AgeingStrip({
  amounts,
  caption,
  currency,
  emptyLabel,
}: {
  amounts: AgeingAmounts | null | undefined;
  /** A line above the bands, where the strip is not already inside a titled card. */
  caption?: string;
  currency?: string;
  emptyLabel?: string;
}) {
  const rows: BreakdownRow[] = ageingBands(amounts).map((band) => ({
    label: band.label,
    amount: band.amount,
    tone: band.tone,
  }));

  return (
    <div>
      {caption ? (
        <div className="mb-1.5 text-[length:var(--type-caption)] text-[color:var(--text-muted)]">
          {caption}
        </div>
      ) : null}
      <Breakdown
        rows={rows}
        formatValue={(value) => formatSchoolMoney(value, currency)}
        emptyLabel={emptyLabel ?? "Nothing is owed."}
      />
    </div>
  );
}
