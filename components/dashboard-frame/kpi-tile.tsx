import * as React from "react";

import { cn } from "@/lib/utils";

import { type Delta, toneClass } from "./types";

/**
 * Small KPI (span 2): label, value, a note led by its signed figure in its
 * tone ("+11 on last Saturday"), then the last seven days as seven bars —
 * today in `--data`, the six before in `--data-compare` — and "Last 7 days".
 */
export function KpiTile({
  label,
  value,
  delta,
  note,
  bars,
  barLabels,
  footnote = "Last 7 days",
  empty,
  span = 2,
}: {
  label: string;
  value: string;
  delta?: Delta | null;
  note?: string | null;
  /** Seven values, oldest first; the last is the current one. */
  bars: ReadonlyArray<number>;
  /** Each bar's tooltip ("Fri 2 Oct · 133"). */
  barLabels?: ReadonlyArray<string>;
  footnote?: string;
  empty?: string | null;
  span?: number;
}) {
  const max = Math.max(...bars.map((bar) => Math.abs(bar)), 0);
  return (
    <section className={cn("cx-df-tile cx-df-kpi", `cx-df-span-${span}`)}>
      <h2 className="cx-df-tile__label">
        {label}
        {empty ? null : <span className="cx-df-tile__value">{value}</span>}
      </h2>
      {empty ? (
        <p className="cx-df-empty">{empty}</p>
      ) : (
        <>
          {delta || note ? (
            <span className="cx-df-kpi__note">
              {delta ? <span className={cn("cx-df-mono", toneClass(delta.tone))}>{delta.text}</span> : null}
              {delta && note ? " " : null}
              {note}
            </span>
          ) : null}
          <div className="cx-df-kpi__bars">
            {bars.map((bar, index) => (
              <span
                key={index}
                title={barLabels?.[index]}
                data-now={index === bars.length - 1 || undefined}
                className={cn("cx-df-kpi__bar", index === bars.length - 1 && "cx-df-kpi__bar--now")}
                style={{ height: `${max > 0 ? Math.round((Math.abs(bar) / max) * 100) : 0}%` }}
              />
            ))}
          </div>
          <span className="cx-df-kpi__foot">{footnote}</span>
        </>
      )}
    </section>
  );
}

export type StripItem = {
  label: string;
  value: string;
  delta?: Delta | null;
  note?: string | null;
};

/**
 * The insight KPI strip: four figures in one bordered box, split by rules;
 * label, value in mono 20/600, then the delta in its tone and the note.
 */
export function KpiStrip({ items }: { items: ReadonlyArray<StripItem> }) {
  return (
    <section aria-label="Summary" className="cx-df-strip">
      {items.map((item) => (
        <div key={item.label} className="cx-df-strip__tile">
          <span className="cx-df-strip__label">{item.label}</span>
          <span className="cx-df-strip__value">{item.value}</span>
          <span className="cx-df-strip__note">
            {item.delta ? (
              <span className={cn("cx-df-strip__delta", toneClass(item.delta.tone) ?? "cx-df-tone-muted")}>{item.delta.text}</span>
            ) : null}
            {item.delta && item.note ? " " : null}
            {item.note}
            {!item.delta && !item.note ? " " : null}
          </span>
        </div>
      ))}
    </section>
  );
}
