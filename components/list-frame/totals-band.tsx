import * as React from "react";

import type { ListColumn, ListSummary, ReportValue } from "@/lib/reports/types";
import { formatCount } from "@/lib/workspace/format";

import { alignOf, cellPadding, diffTone, isFigure, totalText } from "./model";

/**
 * The totals band (00-foundations 5.4.8): pinned to the bottom of the rows,
 * the only band with a shadow. It sums "everything the filters let through,
 * not just this page" from the server's totals, in the same grid as the rows
 * so figures line up to the pixel. While rows are ticked a tinted line above
 * it sums the ticked rows.
 */
export function TotalsBand({
  noun,
  columns,
  template,
  total,
  totals,
  summary,
  selected,
}: {
  noun: string;
  columns: ListColumn[];
  template: string;
  total: number;
  totals: Record<string, ReportValue>;
  summary: ListSummary;
  selected: { count: number; totals: Record<string, ReportValue> } | null;
}) {
  const last = columns.length - 1;
  return (
    <div role="rowgroup" className="cx-lf-totals">
      {selected ? (
        <div
          role="row"
          aria-label={`Totals for the selected ${noun}`}
          className="cx-lf-g cx-lf-selline"
          style={{ gridTemplateColumns: template }}
        >
          <div role="cell" className="cx-lf-tick">
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path
                fillRule="evenodd"
                d="M7 2h10a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5V7a5 5 0 0 1 5-5zm9.3 6.3-6.1 6.1-2.5-2.5-1.4 1.4 3.9 3.9 7.5-7.5z"
              />
            </svg>
          </div>
          {columns.map((column, index) => (
            <div
              key={column.key}
              role="cell"
              className={`cx-lf-c${alignOf(column) === "end" ? " cx-lf-c--end" : ""}`}
              style={{ padding: cellPadding(column, index === last, false), fontWeight: index === 0 || column.cell !== "num" ? 600 : undefined }}
            >
              {index === 0 ? formatCount(selected.count) : isFigure(column) ? totalText(column, selected.totals[column.key]) : null}
            </div>
          ))}
          <div role="cell" />
        </div>
      ) : null}
      <div
        role="row"
        aria-label={`Totals for every ${noun.replace(/s$/, "")} the filters let through`}
        className="cx-lf-g cx-lf-totline"
        style={{ gridTemplateColumns: template }}
      >
        <div role="cell" className="cx-lf-tick cx-lf-sigma" aria-hidden="true">
          Σ
        </div>
        {columns.map((column, index) => {
          let content: React.ReactNode = null;
          let tone = "";
          if (index === 0) content = formatCount(total);
          else if (column.cell === "state" && summary[column.key]) {
            const entry = summary[column.key]!;
            content = (
              <span className="cx-lf-summary">
                <span className="mono">{formatCount(entry.count)}</span> {entry.label}
              </span>
            );
          } else if (isFigure(column) && column.total) {
            content = totalText(column, totals[column.key]);
            if (column.cell === "num") tone = "is-count";
            if (column.cell === "diff") {
              const sign = diffTone(column, totals[column.key]);
              tone = sign === "zero" ? "" : `is-${sign}`;
            }
          }
          return (
            <div
              key={column.key}
              role="cell"
              className={`cx-lf-c${alignOf(column) === "end" ? " cx-lf-c--end" : ""} ${tone}`}
              style={{ padding: cellPadding(column, index === last, false) }}
            >
              {content}
            </div>
          );
        })}
        <div role="cell" />
      </div>
    </div>
  );
}
