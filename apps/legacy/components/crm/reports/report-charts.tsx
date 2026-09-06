"use client";

import { useState } from "react";

import { Chart, ChartLegend, chartSeriesVar } from "@corelithzw/react";

import { EmptyState } from "@corelithzw/react";
import { formatRate, type FunnelStage, type ShareSlice } from "@/lib/crm/reports";
import { cn } from "@/lib/utils";

/**
 * The charts the sales reports are made of.
 *
 * Drawn on the design system's chart primitives where they fit and hand-rolled
 * where they don't — the palette comes from `--chart-1…10` either way, so a
 * retinted theme retints these too rather than leaving one chart on last
 * year's blue.
 */

export type FunnelStageWithDwell = FunnelStage & { medianDaysInStage: number | null };

/**
 * The pipeline, stage by stage.
 *
 * Horizontal rather than the classic tapering funnel: a tapering shape spends
 * its width on decoration and makes the short stages unreadable, and the thing
 * being compared is a set of lengths, which the eye reads best off a common
 * baseline.
 *
 * Each row carries two numbers under it, because they answer different
 * questions. Conversion says how many survive the stage. Time-in-stage says
 * how long the survivors wait — and a stage everything survives but nothing
 * leaves for a month is the one quietly costing the most.
 */
export function FunnelChart({ stages }: { stages: FunnelStageWithDwell[] }) {
  if (stages.length === 0) {
    return <EmptyState title="No deals in this period yet" />;
  }

  const top = stages[0]?.reached ?? 0;

  return (
    <ol className="space-y-3">
      {stages.map((stage, index) => (
        <li key={stage.key}>
          <div className="flex items-baseline justify-between gap-3">
            <span className="truncate text-sm font-medium text-[var(--text-strong)]">
              {stage.label}
            </span>
            <span className="shrink-0 font-mono text-sm text-[var(--text-strong)]">
              {stage.reached}
            </span>
          </div>

          <div
            className="mt-1 h-2 overflow-hidden rounded-full bg-[var(--surface-muted)]"
            role="img"
            aria-label={`${stage.label}: ${stage.reached} of ${top}`}
          >
            <div
              // A stage with a handful of deals still gets a visible sliver:
              // a bar of literally zero width reads as a rendering bug rather
              // than as a small number.
              style={{
                width: `${Math.max(1.5, stage.shareOfTotal * 100)}%`,
                background: chartSeriesVar(index),
              }}
              className="h-full rounded-full"
            />
          </div>

          <div className="mt-1 flex flex-wrap items-baseline gap-x-3 text-sm text-[var(--text-muted)]">
            <span>
              {index === 0
                ? "Everything starts here"
                : `${formatRate(stage.conversionFromPrevious)} of ${stages[index - 1].label}`}
            </span>
            <span>
              {stage.medianDaysInStage === null
                ? "No time recorded"
                : `${stage.medianDaysInStage}d typically spent here`}
            </span>
            {index > 0 && stage.droppedFromPrevious > 0 ? (
              <span className="font-mono">−{stage.droppedFromPrevious}</span>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

export type TrendSeries = {
  label: string;
  points: { period: string; count: number; value: number }[];
};

/** Matches the design system's line geometry so the two look like one chart. */
const TREND_WIDTH = 320;
const TREND_HEIGHT = 120;
const TREND_PAD = 10;

function trendX(index: number, length: number): number {
  return (index / Math.max(1, length - 1)) * (TREND_WIDTH - TREND_PAD * 2) + TREND_PAD;
}

function trendY(value: number, min: number, span: number): number {
  return TREND_HEIGHT - TREND_PAD - ((value - min) / span) * (TREND_HEIGHT - TREND_PAD * 2);
}

/**
 * Money over time, with the numbers readable rather than guessable.
 *
 * The design system's line chart draws the shape but has nowhere to put a
 * value, so the reader is left estimating a figure off a curve. The geometry
 * here is the design system's, exactly — same padding, same scaling — with a
 * hover layer on top, so the line looks identical to every other line in the
 * product and can also be read.
 *
 * Hovering targets a band rather than a point: a two-pixel vertex is a target
 * nobody hits, and the question being asked is about a period, not a pixel.
 */
export function TrendChart({
  series,
  formatValue,
  emptyMessage = "Nothing happened in this period",
}: {
  series: TrendSeries[];
  formatValue: (value: number) => string;
  emptyMessage?: string;
}) {
  const [hovered, setHovered] = useState<number | null>(null);

  const length = series[0]?.points.length ?? 0;
  const everything = series.flatMap((line) => line.points.map((point) => point.value));

  if (length === 0 || everything.length === 0) {
    return <EmptyState title={emptyMessage} />;
  }

  // Anchored at zero rather than at the lowest point: a chart floated off its
  // own minimum turns a flat month into a mountain range.
  const min = 0;
  const max = Math.max(...everything, 0);
  const span = max - min || 1;

  const summary = series
    .map((line) => `${line.label} peaking at ${formatValue(Math.max(...line.points.map((p) => p.value)))}`)
    .join("; ");

  return (
    <div>
      <div
        className="relative"
        onMouseLeave={() => setHovered(null)}
      >
        <svg
          viewBox={`0 0 ${TREND_WIDTH} ${TREND_HEIGHT}`}
          preserveAspectRatio="none"
          className="h-32 w-full"
          role="img"
          aria-label={summary}
        >
          {series.map((line, lineIndex) => (
            <polyline
              key={line.label}
              fill="none"
              stroke={chartSeriesVar(lineIndex)}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              points={line.points
                .map((point, index) => `${trendX(index, length)},${trendY(point.value, min, span)}`)
                .join(" ")}
            />
          ))}

          {hovered !== null ? (
            <line
              x1={trendX(hovered, length)}
              x2={trendX(hovered, length)}
              y1={TREND_PAD}
              y2={TREND_HEIGHT - TREND_PAD}
              stroke="var(--border-strong, var(--border))"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          ) : null}
        </svg>

        {/* One band per period, laid over the drawing. Invisible, but it is
            what the pointer is actually aiming at. */}
        <div className="absolute inset-0 flex">
          {Array.from({ length }, (_, index) => (
            <div
              key={index}
              className="h-full flex-1"
              onMouseEnter={() => setHovered(index)}
              // A finger never hovers, so on touch the chart's values were
              // simply unreadable. `onPointerDown` covers both — a mouse
              // already had the hover, and a tap now reads the same figure.
              onPointerDown={() => setHovered(index)}
            />
          ))}
        </div>

        {hovered !== null ? (
          <div
            className={cn(
              "pointer-events-none absolute top-0 z-10 min-w-32 -translate-x-1/2 rounded-[var(--radius-md)]",
              "border border-[var(--border)] bg-[var(--surface)] p-2 shadow-[var(--shadow-md)]",
            )}
            style={{
              // Clamped in pixels rather than percent. A 12–88% window keeps
              // the centre of a 144px card 43px from the edge of a 358px chart
              // — which is 29px short, so it still overhung on a phone. Half
              // the card's own width is the only bound that holds at every
              // width.
              left: `clamp(4rem, ${
                (trendX(hovered, length) / TREND_WIDTH) * 100
              }%, calc(100% - 4rem))`,
            }}
          >
            <p className="text-sm font-medium text-[var(--text-strong)]">
              {series[0].points[hovered]?.period}
            </p>
            {series.map((line, lineIndex) => (
              <p
                key={line.label}
                className="mt-0.5 flex items-center gap-1.5 text-sm text-[var(--text-muted)]"
              >
                <span
                  aria-hidden="true"
                  className="size-2 shrink-0 rounded-full"
                  style={{ background: chartSeriesVar(lineIndex) }}
                />
                {line.label}
                <span className="ml-auto font-mono text-[var(--text-strong)]">
                  {formatValue(line.points[hovered]?.value ?? 0)}
                </span>
              </p>
            ))}
          </div>
        ) : null}
      </div>

      <ChartLegend
        className="mt-2"
        items={series.map((line, index) => ({
          label: line.label,
          color: chartSeriesVar(index),
        }))}
      />
    </div>
  );
}

export type BarGroup = {
  key: string;
  label: string;
  bars: { label: string; value: number }[];
};

/**
 * Several measures per row, side by side.
 *
 * Grouped rather than stacked because the comparison people actually make is
 * "did they win more than they lost", and a stacked bar answers a different
 * question — how big the total is — while making the first one impossible.
 *
 * Laid out in CSS rather than SVG so the bars reflow with the card instead of
 * being scaled up by a viewBox until the labels blur.
 */
export function GroupedBarChart({
  groups,
  emptyMessage = "Nothing to compare yet",
}: {
  groups: BarGroup[];
  emptyMessage?: string;
}) {
  if (groups.length === 0) return <EmptyState title={emptyMessage} />;

  const peak = Math.max(1, ...groups.flatMap((group) => group.bars.map((bar) => bar.value)));
  const legend = groups[0]?.bars ?? [];

  return (
    <div>
      <div className="flex items-end gap-4 overflow-x-auto pb-1">
        {groups.map((group) => (
          <div key={group.key} className="flex min-w-20 flex-1 flex-col items-center gap-1">
            <div className="flex h-28 w-full items-end justify-center gap-1">
              {group.bars.map((bar, index) => (
                <div
                  key={bar.label}
                  title={`${group.label} — ${bar.label}: ${bar.value}`}
                  className="w-3 rounded-t-[var(--radius-sm)]"
                  style={{
                    // A minimum sliver so a zero is visibly a zero rather than
                    // a bar that failed to render.
                    height: `${Math.max(2, (bar.value / peak) * 100)}%`,
                    background: chartSeriesVar(index),
                  }}
                />
              ))}
            </div>
            <span className="w-full truncate text-center text-sm text-[var(--text-muted)]">
              {group.label}
            </span>
          </div>
        ))}
      </div>

      <ChartLegend
        className="mt-2"
        items={legend.map((bar, index) => ({ label: bar.label, color: chartSeriesVar(index) }))}
      />
    </div>
  );
}

/**
 * Share of a total, as a pie.
 *
 * A pie is a poor way to compare two similar slices and a good way to say "one
 * of these is most of it", which is the question asked of a source mix. The
 * percentages are printed beside the labels rather than left to the eye,
 * because reading an angle to within five percent is not a thing people do.
 */
export function SharePie({
  slices,
  formatValue,
  emptyMessage = "Nothing won in this period",
}: {
  slices: ShareSlice[];
  formatValue: (value: number) => string;
  emptyMessage?: string;
}) {
  if (slices.length === 0) return <EmptyState title={emptyMessage} />;

  return (
    <div className="flex flex-wrap items-center gap-5">
      <Chart.Pie
        size={132}
        className="shrink-0"
        role="img"
        aria-label={slices
          .map((slice) => `${slice.label} ${formatRate(slice.share)}`)
          .join(", ")}
        data={slices.map((slice, index) => ({
          value: slice.value,
          label: slice.label,
          color: chartSeriesVar(index),
        }))}
      />

      <ul className="min-w-0 flex-1 space-y-1">
        {slices.map((slice, index) => (
          <li key={slice.key} className="flex items-baseline gap-2 text-sm">
            <span
              aria-hidden="true"
              className="size-2 shrink-0 translate-y-px rounded-full"
              style={{ background: chartSeriesVar(index) }}
            />
            <span className="min-w-0 flex-1 truncate text-[var(--text-strong)]">
              {slice.label}
            </span>
            <span className="shrink-0 font-mono text-[var(--text-muted)]">
              {formatRate(slice.share)}
            </span>
            <span className="shrink-0 font-mono text-[var(--text-strong)]">
              {formatValue(slice.value)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
