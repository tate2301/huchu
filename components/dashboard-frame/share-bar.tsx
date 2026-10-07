import { cn } from "@/lib/utils";

import { seriesClass } from "./bar-chart";
import type { SeriesColor } from "./types";

export type SharePart = {
  key: string;
  label: string;
  /** The amount as written ("US$526.69"). */
  value: string;
  /** Its share of the whole, 0 to 1. */
  share: number;
  color: SeriesColor;
};

/** "41%": a share of a whole, no decimals. */
export function shareText(share: number) {
  return `${Math.round(share * 100)}%`;
}

/**
 * Share bar (How people paid): one 16px bar split into its parts with 2px
 * gaps and rounded ends, in `--s1`…`--s4` in that fixed order, then a legend
 * row a part with its amount and share — so no part is told by colour alone.
 */
export function ShareBar({ parts, label }: { parts: ReadonlyArray<SharePart>; label?: string }) {
  const shown = parts.filter((part) => part.share > 0);
  return (
    <div className="cx-df-share">
      <div
        role="img"
        aria-label={label ?? shown.map((part) => `${part.label} ${shareText(part.share)}`).join(", ")}
        className="cx-df-share__bar"
      >
        {shown.map((part) => (
          <span
            key={part.key}
            title={`${part.label} · ${part.value} · ${shareText(part.share)}`}
            data-series={part.color}
            className={seriesClass(part.color)}
            style={{ width: `${(part.share * 100).toFixed(2)}%` }}
          />
        ))}
      </div>
      <ul className="contents">
        {parts.map((part) => (
          <li key={part.key} className="cx-df-share__row">
            <span className={cn("cx-df-legend__swatch", seriesClass(part.color))} aria-hidden="true" />
            <span>{part.label}</span>
            <span className="cx-df-share__value">{part.value}</span>
            <span className="cx-df-share__pct">{shareText(part.share)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
