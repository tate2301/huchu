"use client";

import { useMemo, useState } from "react";

import { Button, Icon, Kit, TableFoot } from "@/components/core";
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
    <p role="alert" className="rp-problem">
      <Icon name="warn" />
      <span>{message}</span>
    </p>
  );
}

/** A block's name over it, as the board heads the table ("By rep"). */
function Title({ text }: { text: string | undefined }) {
  if (!text) return null;
  return <h3 className="rp-sec">{text}</h3>;
}

/** One row: each column a headline figure. Many: how many, and what the money and numbers add up to. */
function Figures({ meta, applied, view }: { meta: ReportMeta; applied: AppliedView; view: ReportView }) {
  const figures =
    applied.rows.length === 1
      ? applied.columns.map((column) => ({
          key: column.key,
          label: column.label,
          value: formatValue(applied.rows[0]![column.key], column),
          note: null as string | null,
        }))
      : [
          { key: "rows", label: "Rows", value: applied.rows.length.toLocaleString("en-US"), note: null as string | null },
          ...Object.entries(view.totals).flatMap(([key, fn]) => {
            const column = meta.columns.find((candidate) => candidate.key === key);
            const value = applied.totals[key];
            if (!column || value === null || value === undefined) return [];
            return [{ key, label: column.label, value: formatTotal(value, column, fn), note: totalCaption(fn).toLowerCase() }];
          }),
        ];
  return (
    <div className="rp-figs">
      <div className="kstrip" style={{ gridTemplateColumns: `repeat(${Math.max(1, figures.length)}, minmax(0, 1fr))` }}>
        {figures.map((figure) => (
          <div className="kt" key={figure.key}>
            <span className="kt-l">{figure.label}</span>
            <span className="kt-v">{figure.value}</span>
            {figure.note ? <span className="kt-n muted">{figure.note}</span> : null}
          </div>
        ))}
      </div>
    </div>
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

/** A query block's rows as one CSV, as the table first shows them. Export on the page writes each. */
export function downloadBlockCsv(block: QueryBlock, columns: ReportColumn[], rows: ReportRow[]) {
  const meta = resultMeta(block, columns);
  const view = defaultView(meta);
  download(block.name, exportRows(applyView(rows, meta.columns, view), view));
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
    <section aria-label={block.title ?? block.name} className="rp-tblock">
      <Title text={block.title} />
      <Kit contents>
        <ReportTable applied={applied} view={view} onViewChange={setView} selectedIds={selected} onSelect={setSelected} rowActions={null} />
        {rows.length === 0 ? <p className="muted rp-pad">No rows in these dates.</p> : null}
          {selected.size ? (
            <TableFoot
              selection={{
                count: selected.size,
                onClear: () => setSelected(new Set()),
                actions: (
                  <Button
                    icon="export"
                    onClick={() =>
                      download(block.name, exportRows({ ...applied, rows: applied.rows.filter((row) => selected.has(row.id)), groups: null }, view))
                    }
                  >
                    CSV of these
                  </Button>
                ),
              }}
            />
          ) : null}
      </Kit>
    </section>
  );
}

/** One query block's result in the kit, wherever it is drawn: the report, the builder. */
export function CustomBlockResult(props: React.ComponentProps<typeof ResultView>) {
  return (
    <Kit contents>
      <ResultView {...props} />
    </Kit>
  );
}

function ResultView({
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
      <div className="rp-pad">
        <Title text={block.title} />
        <Problem message={check.problem.message} />
      </div>
    );
  }
  if (loading || !result) {
    return (
      <div aria-busy="true" aria-live="polite" className="rp-pad">
        <Title text={block.title} />
        <div className="skeleton" style={{ height: 28, marginBottom: 6 }} />
        <div className="skeleton" style={{ height: 28, marginBottom: 6 }} />
        <div className="skeleton" style={{ height: 28 }} />
      </div>
    );
  }
  if (!result.ok) {
    return (
      <div className="rp-pad">
        <Title text={block.title} />
        <Problem message={result.problem.message} />
      </div>
    );
  }

  const note = truncated ? (
    <p className="rp-warn">A source this reads stopped at its row limit. Narrow the dates to count every row.</p>
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
      <section aria-label={block.title ?? block.name}>
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
        <div className="rp-pad">
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
      title: block.title ?? `${measureLabel(display.measure, meta!.columns)}, by ${by.label.toLowerCase()}`,
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
