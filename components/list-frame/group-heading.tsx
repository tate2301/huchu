import * as React from "react";

import { CountPill } from "@/components/workspace/count-pill";
import { ChevronDown } from "@/lib/icons";
import type { ListColumn, ListGroup, Tone } from "@/lib/reports/types";
import { formatCount } from "@/lib/workspace/format";

import { cellPadding, diffTone, totalText, trailingFigures } from "./model";

/** The dot beside a group's name, in the group value's tone (Grouped board). */
const DOT: Record<Tone, { background: string; border: string }> = {
  ok: { background: "var(--ok)", border: "var(--ok)" },
  warn: { background: "var(--warn-dot)", border: "var(--warn-dot)" },
  bad: { background: "var(--bad-dot)", border: "var(--bad-dot)" },
  info: { background: "var(--info)", border: "var(--info)" },
  neutral: { background: "var(--faint)", border: "var(--faint)" },
  hollow: { background: "transparent", border: "var(--ink-3)" },
  pending: { background: "transparent", border: "var(--warn-dot)" },
  gold: { background: "var(--warn-dot)", border: "var(--warn-dot)" },
};

/**
 * A group heading (00-foundations 5.4.6, Grouped board): 36px, pinned under
 * the column head while its rows pass. A chevron that folds the group, the
 * dot, the label and the group's whole count, then each figure column's
 * subtotal in the same grid as the rows.
 */
export function GroupHeading({
  group,
  columns,
  template,
  folded,
  onFold,
}: {
  group: ListGroup;
  columns: ListColumn[];
  template: string;
  folded: boolean;
  onFold: () => void;
}) {
  const figures = trailingFigures(columns);
  const tail = columns.slice(columns.length - figures);
  const dot = group.tone ? DOT[group.tone] : null;
  return (
    <div role="row" className="cx-lf-g cx-lf-ghead" style={{ gridTemplateColumns: template }}>
      <div role="cell" className="cx-lf-tick">
        <button
          type="button"
          className="cx-lf-ghead__fold"
          aria-expanded={!folded}
          aria-label={`${folded ? "Show" : "Fold"} ${group.label}`}
          onClick={onFold}
        >
          <ChevronDown aria-hidden />
        </button>
      </div>
      <div role="cell" className="cx-lf-c cx-lf-ghead__label" style={{ gridColumn: `2 / ${-(figures + 2)}` }}>
        {dot ? (
          <span
            className="cx-lf-ghead__dot"
            aria-hidden="true"
            style={{ background: dot.background, border: `1.5px solid ${dot.border}`, boxSizing: "border-box" }}
          />
        ) : null}
        <span className="cx-lf-ghead__name">{group.label}</span>
        <CountPill aria-label={`${formatCount(group.count)} in ${group.label}`}>{formatCount(group.count)}</CountPill>
      </div>
      {tail.map((column, index) => {
        const value = group.totals[column.key];
        const sign = column.cell === "diff" ? diffTone(column, value) : "zero";
        return (
          <div
            key={column.key}
            role="cell"
            className={`cx-lf-c cx-lf-c--end cx-lf-ghead__fig${column.cell === "num" ? "" : " cx-lf-ghead__fig--money"}${sign === "zero" ? "" : ` is-${sign}`}`}
            style={{ padding: cellPadding(column, index === tail.length - 1, false) }}
          >
            {column.total ? totalText(column, value) : null}
          </div>
        );
      })}
      <div role="cell" />
    </div>
  );
}
