"use client";

import type { ReactNode } from "react";

import { cn } from "../lib/utils";

/**
 * Panel chrome for the reporting hubs — a compact head, then content flush to
 * the panel edges so rows carry their own padding and read as a table.
 */
export function ReportPanel({
  title,
  lead,
  note,
  className,
  children,
}: {
  title: string;
  /**
   * A mark before the title — a step number, a status chip.
   *
   * Distinct from `note`, which is pushed to the far edge: a lead sits tight
   * against the title because it qualifies *that panel's identity* rather than
   * commenting on its contents.
   */
  lead?: ReactNode;
  note?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={cn(
        "overflow-hidden rounded-[10px] border border-[var(--border)] bg-[var(--surface)]",
        className,
      )}
    >
      {/* 36px, 13px of side padding — the artboard's panel head. The note is
          pushed to the far edge rather than trailing the title, so a row of
          panels of different widths still has its titles and its notes on two
          shared vertical lines. */}
      <header className="flex min-h-9 items-center gap-2 border-b border-[var(--border-subtle)] px-[13px] py-1">
        {lead}
        <h2 className="truncate text-sm font-bold text-[var(--text-strong)]">{title}</h2>
        {note ? (
          <span className="ml-auto shrink-0 truncate text-sm text-[var(--text-subtle)]">
            {note}
          </span>
        ) : null}
      </header>
      {children}
    </section>
  );
}

export type BreakdownRow = {
  label: string;
  /** The number the bar is drawn from, and what gets formatted on the right. */
  amount: number;
  /** Overrides the right-hand text when the figure is not money (a count, say). */
  display?: string;
  tone?: "neutral" | "warn" | "danger" | "good";
};

const TONE_BAR: Record<string, string> = {
  neutral: "var(--brand)",
  good: "var(--tone-success)",
  warn: "var(--tone-warn)",
  danger: "var(--tone-danger)",
};

const TONE_TEXT: Record<string, string> = {
  neutral: "var(--text-strong)",
  good: "var(--tone-success)",
  warn: "var(--tone-warn)",
  danger: "var(--tone-danger)",
};

/**
 * A proportional breakdown — ageing buckets, document status, anything that is
 * "these parts, out of this whole".
 *
 * Deliberately a labelled bar list rather than a donut. A donut answers "which
 * slice is biggest" and nothing else: you cannot read 12,800 off an arc, you
 * cannot compare two neighbouring slices without a legend, and the legend then
 * costs more room than the labels would have. An ageing report exists to be
 * read to the dollar and acted on — which bucket, how much, is it getting
 * worse — so the number is set as text and the bar is only there to make the
 * shape scannable.
 *
 * It also removes a failure the donut had in practice: with a palette that did
 * not resolve, every slice rendered the same colour and the chart became one
 * black ring carrying no information at all. A bar whose colour fails is still
 * a labelled row with a number on it.
 */
export function Breakdown({
  rows,
  formatValue,
  emptyLabel = "Nothing to show for this period.",
}: {
  rows: BreakdownRow[];
  formatValue: (value: number) => string;
  emptyLabel?: string;
}) {
  const max = rows.reduce((acc, row) => Math.max(acc, Math.abs(row.amount)), 0);

  if (rows.length === 0 || max === 0) {
    return <p className="px-3 py-4 text-sm text-[var(--text-muted)]">{emptyLabel}</p>;
  }

  return (
    // Padding is vertical only: the rows carry their own 13px so a row can
    // take the full panel width when it highlights on hover, the way the
    // table rows on the same page do.
    <div className="py-1.5 pb-2">
      {rows.map((row) => {
        const tone = row.tone ?? "neutral";
        // Zero keeps a visible sliver so an empty bucket still reads as a row
        // with nothing in it, rather than as a missing row.
        const pct = max === 0 ? 0 : Math.max(2, Math.round((Math.abs(row.amount) / max) * 100));
        return (
          <div
            key={row.label}
            className="grid min-h-[30px] grid-cols-[96px_minmax(0,1fr)_110px] items-center px-[13px] hover:bg-[var(--canvas)]"
          >
            <span className="truncate pr-2.5 text-sm text-[var(--text-body)]">{row.label}</span>
            {/* 6px track with 3px corners — not a pill. At this length a fully
                rounded cap eats most of a short bar, so a 3% bucket and a 0%
                bucket look the same. */}
            <span
              aria-hidden="true"
              className="mr-3 h-1.5 overflow-hidden rounded-[3px] bg-[var(--surface-muted)]"
            >
              <span
                className="block h-1.5 rounded-[3px]"
                style={{ width: `${pct}%`, background: TONE_BAR[tone] }}
              />
            </span>
            <span
              className="text-right font-mono text-sm font-semibold tabular-nums"
              style={{ color: TONE_TEXT[tone] }}
            >
              {row.display ?? formatValue(row.amount)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
