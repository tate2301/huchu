"use client";

import * as React from "react";

import { ChartTip } from "./chart-tip";
import { type DashTone, toneClass } from "./types";

export type InsightBar = {
  id: string;
  label: string;
  value: number;
  /** The value as written. */
  text: string;
  note?: string | null;
  tone?: DashTone | null;
};

/**
 * Horizontal bars (an insight's ranking chart): the label, a `--data` bar
 * from the baseline with a rounded end, the figure, and a note in words whose
 * ink carries the judgement — the bar itself is never repainted.
 */
export function InsightBars({ rows, label }: { rows: ReadonlyArray<InsightBar>; label: string }) {
  const [hover, setHover] = React.useState<number | null>(null);
  const max = Math.max(1, ...rows.map((row) => Math.abs(row.value)));
  return (
    <ul className="cx-df-hbars" aria-label={label}>
      {rows.map((row, index) => (
        <li
          key={row.id}
          className="cx-df-hbars__row"
          onMouseEnter={() => setHover(index)}
          onMouseLeave={() => setHover(null)}
        >
          <span className="cx-df-hbars__label">{row.label}</span>
          <span className="cx-df-hbars__track" aria-hidden="true">
            <span className="cx-df-hbars__bar" style={{ width: `${((Math.abs(row.value) / max) * 100).toFixed(1)}%` }} />
          </span>
          <span className="cx-df-hbars__value">{row.text}</span>
          <span className={`cx-df-hbars__note ${toneClass(row.tone) ?? ""}`}>{row.note ?? ""}</span>
          {hover === index ? <ChartTip left="50%" top="-4px" label={row.label} value={row.text} sub={row.note} /> : null}
        </li>
      ))}
    </ul>
  );
}
