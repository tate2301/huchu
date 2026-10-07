import Link from "next/link";

import { cn } from "@/lib/utils";

import { type DashTone, toneClass } from "./types";

export type RankRow = {
  id: string;
  name: string;
  href?: string;
  /** The figure on the right ("US$212.00", "6 left"). */
  value: string;
  valueTone?: DashTone | null;
  /** The bar's length against the longest, 0 to 1. */
  share: number;
  /** Amber bar for a row that is running low. */
  barTone?: "warn" | null;
  /** Under the figure, mono 12 ("8 cases", "reorder at 12"). */
  meta: string;
};

/**
 * Rank list (Top products, Stock to reorder, Cashiers): a head row naming the
 * two columns, then each row's name and figure over a 4px bar and its meta.
 */
export function RankList({ head, rows }: { head: [string, string]; rows: ReadonlyArray<RankRow> }) {
  return (
    <div>
      <div className="cx-df-rank__head">
        <span>{head[0]}</span>
        <span>{head[1]}</span>
      </div>
      <ul>
        {rows.map((row) => (
          <li key={row.id} className="cx-df-rank__row">
            {row.href ? (
              <Link href={row.href} className="cx-df-rank__name">
                {row.name}
              </Link>
            ) : (
              <span className="cx-df-rank__name">{row.name}</span>
            )}
            <span className={cn("cx-df-rank__value", toneClass(row.valueTone))}>{row.value}</span>
            <span className="cx-df-rank__track" aria-hidden="true">
              <span
                className={cn("cx-df-rank__fill", row.barTone === "warn" && "cx-df-rank__fill--warn")}
                style={{ width: `${(Math.min(Math.max(row.share, 0), 1) * 100).toFixed(1)}%` }}
              />
            </span>
            <span className="cx-df-rank__meta">{row.meta}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
