"use client";

import { useState, type ReactNode } from "react";

import { Checkbox } from "@/components/ui/checkbox";
import { formatTotal, formatValue, totalCaption } from "@/lib/reports/format";
import type { ReportColumn, ReportRow, ReportView } from "@/lib/reports/types";
import { isNumeric, rowsWithin, type AppliedView } from "@/lib/reports/view";

/**
 * A report on a phone: one line a row — what it is, and the figure it is
 * about — instead of a table scrolled through a keyhole. The same view drives
 * it, so a filter set on a laptop reads the same here.
 */

const PAGE = 200;

export function ReportRowList({
  applied,
  view,
  selectedIds,
  onSelect,
  rowActions,
}: {
  applied: AppliedView;
  view: ReportView;
  selectedIds: ReadonlySet<string>;
  onSelect: (ids: Set<string>) => void;
  rowActions: ((row: ReportRow) => ReactNode) | null;
}) {
  const [limit, setLimit] = useState(PAGE);
  // A row is named by what it is called, not by its reference number.
  const name =
    applied.columns.find((column) => column.kind === "text" || column.kind === "relation") ??
    applied.columns.find((column) => !isNumeric(column.kind)) ??
    applied.columns[0];
  const figure = applied.columns.find((column) => column.kind === "money") ?? applied.columns.find((column) => isNumeric(column.kind));
  const grouped = view.groupBy ? applied.columns.find((column) => column.key === view.groupBy) : undefined;

  const toggle = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelect(next);
  };

  const visible = rowsWithin(applied, limit);
  const lines = (rows: ReportRow[]) => {
    return rows.map((row) => (
      <li key={row.id} className="flex min-h-11 items-center gap-3 border-b border-[var(--table-divider)] px-1">
        <Checkbox checked={selectedIds.has(row.id)} onCheckedChange={() => toggle(row.id)} aria-label="Select this row" />
        <span className="min-w-0 flex-1 truncate text-[13px] leading-[1.4] font-medium text-[var(--text)]">
          {name ? formatValue(row[name.key], name) : row.id}
        </span>
        {figure ? (
          <span className="shrink-0 font-mono text-[13px] tabular-nums text-[var(--text-strong)]">
            {formatValue(row[figure.key], figure)}
          </span>
        ) : null}
        {rowActions ? <span className="shrink-0">{rowActions(row)}</span> : null}
      </li>
    ));
  };

  const totals = Object.entries(view.totals)
    .map(([key, fn]) => ({ column: applied.columns.find((column) => column.key === key), fn }))
    .filter((entry): entry is { column: ReportColumn; fn: (typeof entry)["fn"] } => Boolean(entry.column));

  const shown = applied.rows.length;

  return (
    <div className="grid gap-4">
      {applied.groups ? (
        applied.groups.map((group, index) => (
          <section key={String(group.value)}>
            <h3 className="mb-1 flex items-baseline gap-2 text-[13px] font-semibold text-[var(--text-strong)]">
              <span className="truncate">
                {group.value === null ? "None" : grouped ? formatValue(group.value, grouped) : String(group.value)}
              </span>
              <span className="font-mono text-[11px] font-medium tabular-nums text-[var(--text-muted)]">{group.rows.length}</span>
            </h3>
            <ul className="border-t border-[var(--table-divider)]">{lines(visible[index]!)}</ul>
          </section>
        ))
      ) : (
        <ul className="border-t border-[var(--table-divider)]">{lines(visible[0]!)}</ul>
      )}

      {shown > limit ? (
        <button
          type="button"
          onClick={() => setLimit((current) => current + PAGE)}
          className="justify-self-center text-sm font-medium text-[var(--brand-strong)]"
        >
          Show more
        </button>
      ) : null}

      {totals.length ? (
        <dl className="grid gap-1.5 border-t border-[var(--border)] pt-3">
          {totals.map(({ column, fn }) => (
            <div key={column.key} className="flex items-baseline justify-between gap-3">
              <dt className="text-[12px] font-medium text-[var(--text-muted)]">
                {column.label} · {totalCaption(fn).toLowerCase()}
              </dt>
              <dd className="font-mono text-[13px] font-medium tabular-nums text-[var(--text-strong)]">
                {formatTotal(applied.totals[column.key], column, fn)}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  );
}
