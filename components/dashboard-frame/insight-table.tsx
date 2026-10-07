"use client";

import * as React from "react";
import Link from "next/link";

import { Tabs } from "@/components/workspace/tabs";
import { cn } from "@/lib/utils";

import { type DashTone, toneClass } from "./types";

export type TableCell = {
  /** Already written: "US$14,204.10", "40.7%", "Beer". */
  text: string;
  tone?: DashTone | "muted" | null;
  mono?: boolean;
  href?: string;
};

export type TableView = {
  id: string;
  label: string;
  columns: ReadonlyArray<{ id: string; label: string; align?: "start" | "end"; width?: string }>;
  rows: ReadonlyArray<{ id: string; cells: Record<string, TableCell | null> }>;
  /** The Σ row: its label sits in the first column. */
  total?: { label: string; cells: Record<string, TableCell | null> } | null;
  empty: string;
};

function CellText({ cell }: { cell: TableCell | null | undefined }) {
  if (!cell) return null;
  const tone = cell.tone === "muted" ? "cx-df-tone-muted" : toneClass(cell.tone);
  const body = cell.href ? <Link href={cell.href}>{cell.text}</Link> : cell.text;
  return <span className={cn(cell.mono && "cx-df-mono", tone)}>{body}</span>;
}

/**
 * Tabs + table (the insight's tables): a 40px tab row with the table's
 * Export at the right, then one table, full width and not in a card — a 34px
 * head on `--ground`, 42px rows, and the Σ row on `--ground` under a
 * `--line-strong` rule. Numbers are mono and right-aligned. On a phone the
 * rows become cards and Σ one line under them.
 */
export function InsightTabs({
  tables,
  value,
  onValueChange,
  exportAction,
}: {
  tables: ReadonlyArray<TableView>;
  value: string;
  onValueChange: (value: string) => void;
  /** The table's Export (INS-05); left out until it exists. */
  exportAction?: React.ReactNode;
}) {
  const table = tables.find((entry) => entry.id === value) ?? tables[0];
  const panelId = React.useId();
  if (!table) return null;
  const template = table.columns
    .map((column, index) => column.width ?? (index === 0 ? "minmax(0, 1fr)" : "120px"))
    .join(" ");
  const first = table.columns[0];
  const figure = table.columns.find((column, index) => index > 0 && column.align === "end");
  const meta = table.columns.filter((column) => column !== first && column !== figure);

  return (
    <section className="cx-df-tabs">
      <div className="cx-df-tabs__row">
        <Tabs
          aria-label={table.label}
          items={tables.map((entry) => ({ value: entry.id, label: entry.label }))}
          value={table.id}
          onValueChange={onValueChange}
          panelId={panelId}
        />
        {exportAction}
      </div>
      <div id={panelId} role="tabpanel">
        <div role="table" aria-label={table.label} className="cx-df-table">
          <div role="row" className="cx-df-table__row cx-df-table__row--head" style={{ gridTemplateColumns: template }}>
            {table.columns.map((column) => (
              <span
                key={column.id}
                role="columnheader"
                className={cn("cx-df-table__cell", column.align === "end" && "cx-df-table__cell--end")}
              >
                {column.label}
              </span>
            ))}
          </div>
          {table.rows.length === 0 ? <p className="cx-df-table__empty">{table.empty}</p> : null}
          {table.rows.map((row) => (
            <div key={row.id} role="row" className="cx-df-table__row" style={{ gridTemplateColumns: template }}>
              {table.columns.map((column) => (
                <span
                  key={column.id}
                  role="cell"
                  className={cn("cx-df-table__cell", column.align === "end" && "cx-df-table__cell--end")}
                >
                  <CellText cell={row.cells[column.id]} />
                </span>
              ))}
            </div>
          ))}
          {table.total && table.rows.length > 0 ? (
            <div role="row" className="cx-df-table__row cx-df-table__row--total" style={{ gridTemplateColumns: template }}>
              {table.columns.map((column, index) => (
                <span
                  key={column.id}
                  role="cell"
                  className={cn("cx-df-table__cell", column.align === "end" && "cx-df-table__cell--end")}
                >
                  {index === 0 ? table.total?.label : <CellText cell={table.total?.cells[column.id]} />}
                </span>
              ))}
            </div>
          ) : null}
        </div>

        <ul className="cx-df-cards" aria-label={table.label}>
          {table.rows.length === 0 ? <li className="cx-df-table__empty">{table.empty}</li> : null}
          {table.rows.map((row) => (
            <li key={row.id} className="cx-df-card">
              <span className="cx-df-card__title">{row.cells[first.id]?.text}</span>
              <span className="cx-df-card__figure">{figure ? row.cells[figure.id]?.text : null}</span>
              <span className="cx-df-card__meta">
                {meta
                  .map((column) => row.cells[column.id]?.text)
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </li>
          ))}
          {table.total && table.rows.length > 0 ? (
            <li className="cx-df-card cx-df-card--total">
              <span className="cx-df-card__title">{table.total.label}</span>
              <span className="cx-df-card__figure">{figure ? table.total.cells[figure.id]?.text : null}</span>
            </li>
          ) : null}
        </ul>
      </div>
    </section>
  );
}
