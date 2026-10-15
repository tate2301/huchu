"use client";

import * as React from "react";

import { Button, ButtonGroup, Icon, Segmented } from "@/components/core";
import { MenuButton } from "@/components/core/menu";
import { formatValue } from "@/lib/reports/format";
import type { ReportColumn, ReportValue } from "@/lib/reports/types";

import type { QuestionResult } from "./use-explore";

/** Rows on one page of the worksheet. */
export const PAGE_SIZE = 50;

type Row = Record<string, ReportValue>;
type Sort = { key: string; dir: "asc" | "desc" } | null;

const NUMERIC = new Set(["number", "money"]);

function compare(a: ReportValue, b: ReportValue): number {
  if (a === b) return 0;
  if (a === null || a === undefined) return 1;
  if (b === null || b === undefined) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), "en-GB", { numeric: true });
}

/** A result as a spreadsheet takes it: raw values, quoted where they need it. */
export function toCsv(columns: readonly ReportColumn[], rows: readonly Row[]): string {
  const cell = (value: ReportValue | undefined) => {
    if (value === null || value === undefined) return "";
    const text = String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return [columns.map((column) => cell(column.key)).join(","), ...rows.map((row) => columns.map((column) => cell(row[column.key])).join(","))].join("\n");
}

function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(2)} s`;
}

/**
 * The rows under a question (the ExploreStudio board's worksheet): search,
 * table or bar chart, filters, sort, group and columns, export, the totals
 * and the pages. Everything here is a view of the rows the question gave
 * back; none of it changes the SQL.
 */
export function Worksheet({
  result,
  title,
  sort: initialSort,
  noun = "rows",
}: {
  result: QuestionResult;
  title: string;
  /** The SQL's own order, drawn on its header. */
  sort?: Sort;
  /** What a row is, for the total ("44 visits"). */
  noun?: string;
}) {
  const [q, setQ] = React.useState("");
  const [as, setAs] = React.useState<"table" | "bars">("table");
  const [sort, setSort] = React.useState<Sort>(initialSort ?? null);
  const [group, setGroup] = React.useState<string | null>(null);
  const [hidden, setHidden] = React.useState<ReadonlySet<string>>(new Set());
  const [hasValue, setHasValue] = React.useState<ReadonlySet<string>>(new Set());
  const [page, setPage] = React.useState(1);

  React.useEffect(() => {
    setPage(1);
  }, [result, q, sort, group, hasValue]);

  const columns = result.columns.filter((column) => !hidden.has(column.key));
  const needle = q.trim().toLowerCase();
  const rows = React.useMemo(() => {
    let out = result.rows.filter((row) => [...hasValue].every((key) => row[key] !== null && row[key] !== undefined && row[key] !== ""));
    if (needle) out = out.filter((row) => result.columns.some((column) => String(row[column.key] ?? "").toLowerCase().includes(needle)));
    if (group || sort) {
      out = [...out].sort((a, b) => {
        if (group) {
          const byGroup = compare(a[group] ?? null, b[group] ?? null);
          if (byGroup) return byGroup;
        }
        if (!sort) return 0;
        const order = compare(a[sort.key] ?? null, b[sort.key] ?? null);
        return sort.dir === "asc" ? order : -order;
      });
    }
    return out;
  }, [result, needle, sort, group, hasValue]);

  const totals = columns.map((column) =>
    column.kind === "money" ? rows.reduce((sum, row) => sum + (typeof row[column.key] === "number" ? (row[column.key] as number) : 0), 0) : null,
  );
  const from = rows.length ? (page - 1) * PAGE_SIZE + 1 : 0;
  const to = Math.min(rows.length, page * PAGE_SIZE);
  const shown = rows.slice(from ? from - 1 : 0, to);

  const label = columns.find((column) => !NUMERIC.has(column.kind));
  const measure = columns.find((column) => column.kind === "money") ?? columns.find((column) => column.kind === "number");

  const exportCsv = () => {
    const blob = new Blob([toCsv(columns, rows)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${title.replace(/[^A-Za-z0-9 _-]+/g, "").trim() || "question"}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const cycleSort = (key: string) =>
    setSort((current) => (current?.key === key ? (current.dir === "desc" ? { key, dir: "asc" } : null) : { key, dir: "desc" }));

  return (
    <div className="wt">
      <div className="ws-tools">
        <label className="input-wrap ws-find">
          <Icon name="search" />
          <input type="search" aria-label="Search the rows" placeholder="Search the rows" value={q} onChange={(event) => setQ(event.target.value)} />
        </label>
        <Segmented
          label="Show as"
          value={as}
          onChange={setAs}
          items={[
            { value: "table", label: "Table" },
            { value: "bars", label: "Bar chart" },
          ]}
        />
        <MenuButton
          icon="filter"
          label="Filters"
          items={[
            { heading: "Only rows that have" },
            ...result.columns.map((column) => ({
              key: column.key,
              label: column.label,
              checked: hasValue.has(column.key),
              onSelect: () =>
                setHasValue((current) => {
                  const next = new Set(current);
                  if (next.has(column.key)) next.delete(column.key);
                  else next.add(column.key);
                  return next;
                }),
            })),
          ]}
        >
          Filters
        </MenuButton>
        <span className="ws-n">
          {rows.length.toLocaleString("en-GB")} {rows.length === 1 ? "row" : "rows"} · {seconds(result.ms)}
        </span>
        <div className="end">
          <span className="sepv" />
          <MenuButton
            variant="quiet"
            icon="sort"
            align="end"
            label="Sort"
            items={result.columns.flatMap((column) => [
              { key: `${column.key}:desc`, label: `${column.label}, biggest first`, checked: sort?.key === column.key && sort.dir === "desc", onSelect: () => setSort({ key: column.key, dir: "desc" }) },
              { key: `${column.key}:asc`, label: `${column.label}, smallest first`, checked: sort?.key === column.key && sort.dir === "asc", onSelect: () => setSort({ key: column.key, dir: "asc" }) },
            ])}
          >
            Sort
          </MenuButton>
          <MenuButton
            variant="quiet"
            icon="grid"
            align="end"
            label="Group"
            items={[
              { key: "none", label: "No grouping", checked: !group, onSelect: () => setGroup(null) },
              { separator: true },
              ...result.columns.filter((column) => !NUMERIC.has(column.kind)).map((column) => ({ key: column.key, label: column.label, checked: group === column.key, onSelect: () => setGroup(column.key) })),
            ]}
          >
            Group
          </MenuButton>
          <MenuButton
            variant="quiet"
            icon="columns"
            align="end"
            label="Columns"
            items={result.columns.map((column) => ({
              key: column.key,
              label: column.label,
              checked: !hidden.has(column.key),
              onSelect: () =>
                setHidden((current) => {
                  const next = new Set(current);
                  if (next.has(column.key)) next.delete(column.key);
                  else if (next.size < result.columns.length - 1) next.add(column.key);
                  return next;
                }),
            }))}
          >
            Columns
          </MenuButton>
          <Button icon="export" onClick={exportCsv}>
            Export
          </Button>
        </div>
      </div>
      <div className="ws-scroll" tabIndex={0} aria-label={`${title}, rows`}>
        {as === "bars" && label && measure && rows.length > 0 ? (
          <Bars rows={rows} label={label} measure={measure} />
        ) : (
          <table className="table">
            <thead>
              <tr>
                {columns.map((column) => {
                  const on = sort?.key === column.key;
                  return (
                    <th key={column.key} className={NUMERIC.has(column.kind) ? "num" : undefined} aria-sort={on ? (sort!.dir === "desc" ? "descending" : "ascending") : undefined}>
                      <button type="button" className="sort" onClick={() => cycleSort(column.key)}>
                        {column.key}
                        {on ? <Icon name={sort!.dir === "desc" ? "down" : "caret"} /> : null}
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="ex-norows">
                    <b>{result.rows.length ? "No row matches" : "The question gave back no rows"}</b>
                    <span className="muted">{result.rows.length ? " Clear the search or the filters to see the rest." : " Change the question, or ask Vane to."}</span>
                  </td>
                </tr>
              ) : null}
              {shown.map((row, index) => {
                const head = group && (index === 0 || shown[index - 1]![group] !== row[group]) ? row[group] : undefined;
                return (
                  <React.Fragment key={from + index}>
                    {group && head !== undefined ? (
                      <tr className="grp">
                        <td colSpan={columns.length}>
                          {formatValue(head, result.columns.find((column) => column.key === group)!)}
                          <span className="n">{rows.filter((other) => other[group] === head).length}</span>
                        </td>
                      </tr>
                    ) : null}
                    <tr>
                      {columns.map((column, at) => (
                        <td key={column.key} className={NUMERIC.has(column.kind) ? "num" : column.kind === "date" && at === 0 ? "muted" : undefined}>
                          {column.kind === "status" && row[column.key] !== null && row[column.key] !== undefined ? (
                            <span className="status">{formatValue(row[column.key], column)}</span>
                          ) : (
                            formatValue(row[column.key], column)
                          )}
                        </td>
                      ))}
                    </tr>
                  </React.Fragment>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                {columns.map((column, at) => (
                  <td key={column.key} className={NUMERIC.has(column.kind) ? "num" : undefined}>
                    {at === 0 ? `${rows.length.toLocaleString("en-GB")} ${noun}` : totals[at] !== null ? formatValue(totals[at], column) : ""}
                  </td>
                ))}
              </tr>
            </tfoot>
          </table>
        )}
      </div>
      {result.truncated || result.sourceCut ? (
        <p className="ex-cut">
          {result.truncated
            ? "More rows matched than Explore gives back: the first 5,000 are shown. Narrow the question to see the rest."
            : "A table this question reads holds more rows than a report sends, so the last ones are not in it."}
        </p>
      ) : null}
      <div className="table-foot">
        <div className="foot-row">
          <span className="num">{rows.length ? `${from} to ${to} of ${rows.length.toLocaleString("en-GB")}` : "None"}</span>
          <div className="end">
            <ButtonGroup aria-label="Pages">
              <Button icon="back" disabled={page <= 1} onClick={() => setPage((n) => n - 1)}>
                Previous
              </Button>
              <Button iconEnd="chev" disabled={to >= rows.length} onClick={() => setPage((n) => n + 1)}>
                Next
              </Button>
            </ButtonGroup>
          </div>
        </div>
      </div>
    </div>
  );
}

/** The rows as bars: the first text column against the first figure, biggest first, at most 20. */
function Bars({ rows, label, measure }: { rows: readonly Row[]; label: ReportColumn; measure: ReportColumn }) {
  const top = [...rows]
    .filter((row) => typeof row[measure.key] === "number")
    .sort((a, b) => (b[measure.key] as number) - (a[measure.key] as number))
    .slice(0, 20);
  const max = Math.max(1, ...top.map((row) => Math.abs(row[measure.key] as number)));
  return (
    <figure className="ex-bars" aria-label={`${measure.label} by ${label.label}`}>
      {top.map((row, index) => (
        <div key={index} className="ex-bar">
          <span className="ex-bar-l">{formatValue(row[label.key], label)}</span>
          <span className="ex-bar-t">
            <span className="ex-bar-f" style={{ width: `${(Math.abs(row[measure.key] as number) / max) * 100}%` }} />
          </span>
          <span className="ex-bar-v num">{formatValue(row[measure.key], measure)}</span>
        </div>
      ))}
    </figure>
  );
}
