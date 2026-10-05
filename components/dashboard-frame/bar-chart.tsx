"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

import { ChartTip } from "./chart-tip";
import type { SeriesColor } from "./types";

/**
 * A y axis that reads: four steps of 1, 2, 2.5 or 5 × 10ⁿ from zero to at
 * least `max`.
 */
export function niceScale(max: number, steps = 4) {
  if (!(max > 0)) return { top: steps, ticks: Array.from({ length: steps + 1 }, (_, index) => steps - index) };
  const raw = max / steps;
  const power = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((factor) => factor * power).find((candidate) => candidate >= raw) ?? 10 * power;
  const top = step * steps;
  return { top, ticks: Array.from({ length: steps + 1 }, (_, index) => top - index * step) };
}

/** "2k", "1.5k", "500", "0" — an axis label, not a figure. */
export function compactTick(value: number) {
  if (Math.abs(value) >= 1_000_000) return `${Number((value / 1_000_000).toFixed(1))}m`;
  if (Math.abs(value) >= 1000) return `${Number((value / 1000).toFixed(1))}k`;
  return String(Number(value.toFixed(1)));
}

function Grid({ ticks }: { ticks: number[] }) {
  return (
    <div className="cx-df-bars__grid" aria-hidden="true">
      {ticks.map((tick) => (
        <span key={tick}>{compactTick(tick)}</span>
      ))}
    </div>
  );
}

export type Bar = {
  /** The bar's name in the tooltip ("Fri 2 October"). */
  label: string;
  value: number;
  /** The value as written ("US$1,284.60"). */
  text: string;
  /** A third tooltip line ("142 sales"). */
  sub?: string | null;
};

/**
 * Bar chart (Takings by day): a 180px plot over a dashed grid with its y
 * labels, one bar a slot with 2px gaps, 4px rounded tops. The last bar —
 * today — is `--data`, the rest `--data-muted`. Hovering a bar shows its day,
 * value and note; x labels sit under the plot.
 */
export function BarChart({
  bars,
  xLabels,
  label,
  emphasiseLast = true,
}: {
  bars: ReadonlyArray<Bar>;
  /** A few dates spread under the plot ("4 Sep" … "3 Oct"). */
  xLabels: ReadonlyArray<string>;
  label: string;
  emphasiseLast?: boolean;
}) {
  const [hover, setHover] = React.useState<number | null>(null);
  const scale = niceScale(Math.max(0, ...bars.map((bar) => bar.value)));
  const tip = hover === null ? null : bars[hover];
  return (
    <div className="cx-df-bars">
      <Grid ticks={scale.ticks} />
      <div className="cx-df-bars__plot" role="img" aria-label={label}>
        {bars.map((bar, index) => (
          <span
            key={index}
            className="cx-df-bars__slot"
            onMouseEnter={() => setHover(index)}
            onMouseLeave={() => setHover(null)}
          >
            <span
              data-bar=""
              data-now={(emphasiseLast && index === bars.length - 1) || undefined}
              className={cn("cx-df-bars__bar", emphasiseLast && index === bars.length - 1 && "cx-df-bars__bar--now")}
              style={{ height: `${((Math.max(bar.value, 0) / scale.top) * 100).toFixed(2)}%` }}
            />
          </span>
        ))}
        {tip && hover !== null ? (
          <ChartTip
            left={`${(((hover + 0.5) / bars.length) * 100).toFixed(2)}%`}
            top="-8px"
            label={tip.label}
            value={tip.text}
            sub={tip.sub}
          />
        ) : null}
      </div>
      <div className="cx-df-bars__x" aria-hidden="true">
        {xLabels.map((tick, index) => (
          <span key={`${tick}-${index}`}>{tick}</span>
        ))}
      </div>
    </div>
  );
}

const SERIES_CLASS: Record<SeriesColor, string> = {
  s1: "cx-df-s1",
  s2: "cx-df-s2",
  s3: "cx-df-s3",
  s4: "cx-df-s4",
  data: "cx-df-sdata",
  muted: "cx-df-smuted",
};

export function seriesClass(color: SeriesColor) {
  return SERIES_CLASS[color];
}

/**
 * Columns: a group a period (a week), the series either stacked (parts of one
 * whole) or side by side (two things to compare), in their fixed colours.
 * Every segment has a tooltip; the legend sits in the question panel's head.
 */
export function ColumnsChart({
  series,
  groups,
  stacked,
  format,
  label,
}: {
  series: ReadonlyArray<{ key: string; label: string; color: SeriesColor }>;
  groups: ReadonlyArray<{ label: string; values: Record<string, number> }>;
  stacked: boolean;
  format: (value: number) => string;
  label: string;
}) {
  const [hover, setHover] = React.useState<{ group: number; key: string } | null>(null);
  const heights = groups.map((group) =>
    stacked
      ? series.reduce((sum, entry) => sum + Math.max(group.values[entry.key] ?? 0, 0), 0)
      : Math.max(0, ...series.map((entry) => group.values[entry.key] ?? 0)),
  );
  const scale = niceScale(Math.max(0, ...heights));
  const pct = (value: number) => `${((Math.max(value, 0) / scale.top) * 100).toFixed(2)}%`;
  const tipGroup = hover ? groups[hover.group] : null;
  const tipSeries = hover ? series.find((entry) => entry.key === hover.key) : null;

  return (
    <div className="cx-df-bars">
      <Grid ticks={scale.ticks} />
      <div className="cx-df-bars__plot" role="img" aria-label={label} style={{ gap: groups.length > 10 ? 6 : 16 }}>
        {groups.map((group, groupIndex) => (
          <span key={group.label} className="cx-df-bars__slot">
            {stacked ? (
              <span className="cx-df-bars__stack">
                {series.map((entry) => (
                  <span
                    key={entry.key}
                    className={seriesClass(entry.color)}
                    style={{ height: pct(group.values[entry.key] ?? 0) }}
                    onMouseEnter={() => setHover({ group: groupIndex, key: entry.key })}
                    onMouseLeave={() => setHover(null)}
                  />
                ))}
              </span>
            ) : (
              series.map((entry) => (
                <span
                  key={entry.key}
                  className={cn("cx-df-bars__bar", seriesClass(entry.color))}
                  style={{ height: pct(group.values[entry.key] ?? 0), maxWidth: 28 }}
                  onMouseEnter={() => setHover({ group: groupIndex, key: entry.key })}
                  onMouseLeave={() => setHover(null)}
                />
              ))
            )}
          </span>
        ))}
        {hover && tipGroup && tipSeries ? (
          <ChartTip
            left={`${(((hover.group + 0.5) / groups.length) * 100).toFixed(2)}%`}
            top="-6px"
            label={`${tipGroup.label} · ${tipSeries.label}`}
            value={format(tipGroup.values[tipSeries.key] ?? 0)}
          />
        ) : null}
      </div>
      <div className="cx-df-bars__x cx-df-bars__x--even" aria-hidden="true">
        {groups.map((group) => (
          <span key={group.label}>{group.label}</span>
        ))}
      </div>
    </div>
  );
}
