"use client";

import { formatFigure } from "@/components/retail/insights/format";
import type { Format, Tone } from "@/lib/retail/insights";

const TONE_INK: Record<Tone, string> = {
  good: "var(--tone-success-strong)",
  warn: "var(--tone-warn)",
  bad: "var(--tone-danger-strong)",
};

/**
 * Rows of horizontal bars: the label, the bar, the figure, and a note in
 * words. The bar is one quiet colour; a row that needs somebody says so in
 * its note's ink, not by repainting the bar.
 */
export function InsightBars({
  rows,
  format,
}: {
  rows: Array<{ id: string; label: string; value: number; note?: string; tone?: Tone }>;
  format: Format;
}) {
  if (rows.length === 0) return <p className="text-sm text-[var(--text-muted)]">Nothing to show for this period.</p>;
  const max = Math.max(1, ...rows.map((row) => Math.abs(row.value)));
  return (
    <ul className="space-y-2.5">
      {rows.map((row) => (
        <li key={row.id} className="grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)_auto] items-center gap-3 text-sm sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)_7rem_9rem]">
          <span className="truncate text-[var(--text-strong)]">{row.label}</span>
          <span className="h-2.5 rounded-full bg-[var(--surface-muted)]">
            <span
              className="block h-full rounded-full bg-[var(--text-muted)]"
              style={{ width: `${Math.max((Math.abs(row.value) / max) * 100, 1.5)}%` }}
            />
          </span>
          <span className="text-right font-mono tabular-nums text-[var(--text-strong)]">{formatFigure(row.value, format)}</span>
          {row.note ? (
            <span className="hidden text-xs sm:block" style={{ color: row.tone ? TONE_INK[row.tone] : "var(--text-muted)" }}>
              {row.note}
            </span>
          ) : (
            <span className="hidden sm:block" />
          )}
        </li>
      ))}
    </ul>
  );
}
