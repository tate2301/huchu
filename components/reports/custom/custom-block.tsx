"use client";

import { useMemo, useState } from "react";

import { Skeleton } from "@corelithzw/react";
import { Button } from "@/components/ui/button";
import { Download, Warning } from "@/lib/icons";
import type { QueryBlock } from "@/lib/reports/custom/document";
import type { BlockCheck, BlockResult } from "@/lib/reports/custom/run";
import { exportRows } from "@/lib/reports/export";
import { formatTotal, formatValue, totalCaption } from "@/lib/reports/format";
import { measureLabel, type BreakdownBlock, type ChartBlock } from "@/lib/reports/layout";
import type { ReportColumn, ReportMeta, ReportParams, ReportRow, ReportView } from "@/lib/reports/types";
import { applyView, defaultView, isNumeric, type AppliedView } from "@/lib/reports/view";

import { Leaf } from "../report-blocks";
import { ReportTable } from "../report-table";

/**
 * One query block's result, drawn the way the matching block on a report's
 * page is drawn — the same table, the same charts, the same breakdown — by
 * treating the result as a report of its own: its columns, its rows.
 */

/** The result as a report the page's blocks can read. Money is totalled unless the source says otherwise. */
export function resultMeta(block: QueryBlock, columns: ReportColumn[]): ReportMeta {
  return {
    key: block.name,
    title: block.title ?? "",
    area: "",
    columns: columns.map((column) => (column.total || column.kind !== "money" ? column : { ...column, total: "sum" })),
    params: [],
    defaults: {},
  };
}

function Problem({ message }: { message: string }) {
  return (
    <p role="alert" className="flex items-start gap-2 text-[13px] leading-[1.5] text-[var(--status-error-text)]">
      <Warning className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span>{message}</span>
    </p>
  );
}

function Title({ text, children }: { text: string | undefined; children?: React.ReactNode }) {
  if (!text && !children) return null;
  return (
    <div className="mb-2.5 flex min-h-7 items-center gap-2">
      {text ? <h2 className="min-w-0 flex-1 truncate text-[15px] leading-[1.35] font-semibold text-[var(--text-strong)]">{text}</h2> : <span className="flex-1" />}
      {children}
    </div>
  );
}

/** One row: each column a headline figure. Many: how many, and what the money and numbers add up to. */
function Figures({ meta, applied, view }: { meta: ReportMeta; applied: AppliedView; view: ReportView }) {
  const figures =
    applied.rows.length === 1
      ? applied.columns.map((column) => ({
          key: column.key,
          label: column.label,
          value: formatValue(applied.rows[0]![column.key], column),
        }))
      : [
          { key: "rows", label: "Rows", value: applied.rows.length.toLocaleString("en-US") },
          ...Object.entries(view.totals).flatMap(([key, fn]) => {
            const column = meta.columns.find((candidate) => candidate.key === key);
            const value = applied.totals[key];
            if (!column || value === null || value === undefined) return [];
            return [
              {
                key,
                label: fn === "sum" ? column.label : `${column.label} · ${totalCaption(fn).toLowerCase()}`,
                value: formatTotal(value, column, fn),
              },
            ];
          }),
        ];
  return (
    <dl className="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-x-6 gap-y-3">
      {figures.map((figure) => (
        <div key={figure.key} className="border-t border-[var(--border)] pt-2">
          <dt className="truncate text-[12px] leading-[1.4] font-medium text-[var(--text-muted)]">{figure.label}</dt>
          <dd className="mt-0.5 truncate font-mono text-[17px] leading-[1.25] font-semibold tracking-[-0.012em] tabular-nums text-[var(--text-strong)]">
            {figure.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function download(name: string, csv: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${name}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function Table({ block, meta, rows }: { block: QueryBlock; meta: ReportMeta; rows: ReportRow[] }) {
  const [view, setView] = useState<ReportView>(() => defaultView(meta));
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  // Rows are numbered by position, so new rows — other dates, an edited query — are a new selection.
  const [seenRows, setSeenRows] = useState(rows);
  if (rows !== seenRows) {
    setSeenRows(rows);
    setSelected(new Set());
  }
  const applied = useMemo(() => applyView(rows, meta.columns, view), [meta.columns, rows, view]);
  return (
    <section aria-label={block.title ?? block.name} className="min-w-0">
      <Title text={block.title}>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            const shown = selected.size ? { ...applied, rows: applied.rows.filter((row) => selected.has(row.id)), groups: null } : applied;
            download(block.name, exportRows(shown, view));
          }}
        >
          <Download className="size-4" aria-hidden="true" />
          {selected.size ? `CSV of ${selected.size.toLocaleString("en-US")}` : "CSV"}
        </Button>
      </Title>
      {rows.length === 0 ? (
        <p className="text-[13px] text-[var(--text-muted)]">No rows in these dates.</p>
      ) : (
        // A wide result scrolls inside its block; the page never scrolls sideways.
        <div className="min-w-0 overflow-x-auto">
          <ReportTable applied={applied} view={view} onViewChange={setView} selectedIds={selected} onSelect={setSelected} rowActions={null} />
        </div>
      )}
    </section>
  );
}

export function CustomBlockResult({
  block,
  check,
  result,
  loading,
  params,
  width,
  truncated,
}: {
  block: QueryBlock;
  check: BlockCheck | undefined;
  result: BlockResult | undefined;
  /** Rows for a source it reads are still on their way. */
  loading: boolean;
  params: ReportParams;
  width: number;
  /** A source it reads came back cut short. */
  truncated: boolean;
}) {
  const columns = result?.ok ? result.columns : null;
  // A new set of columns is a new result: the table's own sort and totals start over.
  const signature = columns?.map((column) => `${column.key}:${column.kind}`).join("|") ?? "";
  const meta = useMemo(() => (columns ? resultMeta(block, columns) : null), [block, columns]);

  if (check && !check.ok) {
    return (
      <div>
        <Title text={block.title} />
        <Problem message={check.problem.message} />
      </div>
    );
  }
  if (loading || !result) {
    return (
      <div aria-busy="true" aria-live="polite" className="grid gap-1.5">
        <Title text={block.title} />
        <Skeleton height={28} />
        <Skeleton height={28} />
        <Skeleton height={28} />
      </div>
    );
  }
  if (!result.ok) {
    return (
      <div>
        <Title text={block.title} />
        <Problem message={result.problem.message} />
      </div>
    );
  }

  const note = truncated ? (
    <p className="mt-2 text-[12px] font-medium text-[var(--status-warning-text)]">
      A source this reads stopped at its row limit. Narrow the dates to count every row.
    </p>
  ) : null;

  const { display } = block;
  if (display.type === "table") {
    return (
      <>
        <Table key={signature} block={block} meta={meta!} rows={result.rows} />
        {note}
      </>
    );
  }

  const view = defaultView(meta!);
  const applied = applyView(result.rows, meta!.columns, view);
  const context = { meta: meta!, view, params, applied };

  if (display.type === "figures") {
    return (
      <section aria-label={block.title ?? block.name} className="min-w-0">
        <Title text={block.title} />
        <Figures meta={meta!} applied={applied} view={view} />
        {note}
      </section>
    );
  }

  if (display.type === "chart") {
    const by = meta!.columns.find((column) => column.key === display.by);
    if (!by || (display.measure && !meta!.columns.some((column) => column.key === display.measure!.column))) {
      return (
        <div>
          <Title text={block.title} />
          <Problem
            message={
              !display.by
                ? "Choose what to chart by, from the block's toolbar"
                : by
                  ? `There is no ${display.measure!.column} to measure any more — choose another in the toolbar`
                  : `There is no ${display.by} to chart by any more — choose another in the toolbar`
            }
          />
        </div>
      );
    }
    const chart: ChartBlock = {
      id: block.id,
      type: "chart",
      form: display.form,
      by: display.by,
      ...(display.measure ? { measure: display.measure } : {}),
      ...(display.limit ? { limit: display.limit } : {}),
      title: block.title ?? `${measureLabel(display.measure, meta!.columns)} ${display.form === "bars" ? `by ${by.label.toLowerCase()}` : "over time"}`,
    };
    return (
      <>
        <Leaf block={chart} width={width} {...context} />
        {note}
      </>
    );
  }

  const breakdown: BreakdownBlock = {
    id: block.id,
    type: "breakdown",
    ...(display.by ? { by: display.by } : {}),
    ...(display.limit ? { limit: display.limit } : {}),
  };
  return (
    <>
      {block.title ? <Title text={block.title} /> : null}
      <Leaf block={breakdown} width={width} {...context} />
      {note}
    </>
  );
}

/** The columns a result has that a chart can be drawn by, and measured with. */
export function chartColumns(columns: ReportColumn[], form: "bars" | "trend") {
  return {
    by: columns.filter((column) => (form === "trend" ? column.kind === "date" : !isNumeric(column.kind))),
    measures: columns.filter((column) => isNumeric(column.kind)),
  };
}
