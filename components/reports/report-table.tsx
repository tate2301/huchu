"use client";

import { useState, type ReactNode } from "react";

import { Icon, Kit, SelectCell, Status, type Tone } from "@/components/core";
import { MenuButton } from "@/components/core/menu";
import { formatTotal, formatValue, totalCaption } from "@/lib/reports/format";
import type { Aggregate, ReportColumn, ReportRow, ReportView } from "@/lib/reports/types";
import { aggregatesFor, AGGREGATE_LABELS, isNumeric, rowsWithin, type AppliedView } from "@/lib/reports/view";

/**
 * A report's rows as the kit's table (PageReport): sort from the headers,
 * fold the groups, choose each column's total from its foot, select rows to
 * act on them. Grouped, the group's column leaves the table: its value heads
 * each group, with how many rows and their totals.
 *
 * Presentational. It is handed the view already applied and says what should
 * change; the rows are never filtered or sorted here, because the same view has
 * to produce the same file on the server.
 */

/** How many rows are drawn before "Show more". Totals always cover every row. */
const PAGE = 400;

const DONE = /^(won|paid|done|complete|completed|approved|closed|delivered|posted|present|active|in stock)$/i;
const BAD = /^(lost|cancelled|canceled|failed|overdue|rejected|void|absent|declined|out of stock)$/i;
const WAITING = /^(pending|draft|waiting|on hold|late|due|partly paid|part paid|scheduled)$/i;
const OPEN = /^(open|new|in progress|sent|quoted|booked)$/i;

/** A state's dot: done, gone wrong, waiting, or still going. */
export function statusTone(value: string): Tone | undefined {
  if (DONE.test(value)) return "success";
  if (BAD.test(value)) return "danger";
  if (WAITING.test(value)) return "warning";
  if (OPEN.test(value)) return "info";
  return undefined;
}

function shown(row: ReportRow, column: ReportColumn): string | null {
  const value = row[column.key];
  if (value === null || value === undefined || value === "") return null;
  return column.kind === "number" || column.kind === "money" || column.kind === "date" || typeof value === "boolean"
    ? formatValue(value, column)
    : String(value);
}

function Cell({ row, column, lead }: { row: ReportRow; column: ReportColumn; lead: boolean }) {
  const text = shown(row, column);
  if (text === null) return <td className={isNumeric(column.kind) ? "num muted" : "muted"}>—</td>;
  switch (column.kind) {
    case "code":
      return (
        <td>
          <span className="ref">{text}</span>
        </td>
      );
    case "status":
      return (
        <td>
          <Status tone={statusTone(text)}>{text}</Status>
        </td>
      );
    case "money":
      return (
        <td className="num" style={{ fontWeight: 600, color: "var(--color-ink)" }}>
          {text}
        </td>
      );
    case "number":
      return <td className="num">{text}</td>;
    case "date":
      return <td className="muted">{text}</td>;
    case "phone":
      return (
        <td className="muted">
          <a href={`tel:${text.replace(/\s+/g, "")}`}>{text}</a>
        </td>
      );
    case "email":
      return (
        <td className="muted">
          <a href={`mailto:${text}`}>{text}</a>
        </td>
      );
    case "relation":
      return (
        <td className="fill">
          <span className="cell-lead">{text}</span>
        </td>
      );
    default:
      return lead ? (
        <td className="fill">
          <span className="cell-lead">{text}</span>
        </td>
      ) : (
        <td className="muted">{text}</td>
      );
  }
}

function nextSort(view: ReportView, column: string, additive: boolean): ReportView["sort"] {
  const current = view.sort.find((rule) => rule.column === column);
  const others = additive ? view.sort.filter((rule) => rule.column !== column) : [];
  if (!current) return [...others, { column, dir: "asc" }];
  if (current.dir === "asc") return [...others, { column, dir: "desc" }];
  return others;
}

function TotalMenu({
  column,
  fn,
  value,
  onChange,
}: {
  column: ReportColumn;
  fn: Aggregate | undefined;
  value: AppliedView["totals"][string] | undefined;
  onChange: (fn: Aggregate | null) => void;
}) {
  return (
    <MenuButton
      variant="quiet"
      size="sm"
      iconEnd={undefined}
      align={isNumeric(column.kind) ? "end" : "start"}
      label={`Total of ${column.label}`}
      className={fn ? "rp-total" : "rp-total is-empty"}
      aria-label={fn ? `${column.label}: ${totalCaption(fn)}. Change the total` : `Total ${column.label}`}
      items={[
        ...aggregatesFor(column.kind).map((option) => ({
          key: option,
          label: AGGREGATE_LABELS[option],
          checked: fn === option,
          onSelect: () => onChange(option),
        })),
        { separator: true as const },
        { key: "none", label: "None", checked: !fn, onSelect: () => onChange(null) },
      ]}
    >
      {fn ? (
        <>
          <span className="muted" aria-hidden="true">{totalCaption(fn)}</span> <b>{formatTotal(value, column, fn)}</b>
        </>
      ) : (
        <span aria-hidden="true">Total</span>
      )}
    </MenuButton>
  );
}

export function ReportTable({
  applied,
  view,
  onViewChange,
  selectedIds,
  onSelect,
  rowActions,
}: {
  applied: AppliedView;
  view: ReportView;
  onViewChange: (view: ReportView) => void;
  selectedIds: ReadonlySet<string>;
  onSelect: (ids: Set<string>) => void;
  /** The trailing cell of a row; null leaves the column out. */
  rowActions: ((row: ReportRow) => ReactNode) | null;
}) {
  const [limit, setLimit] = useState(PAGE);
  const [folded, setFolded] = useState<ReadonlySet<string>>(new Set());
  const groupColumn = view.groupBy ? applied.columns.find((column) => column.key === view.groupBy) ?? null : null;
  // Grouped, the group's value heads each group instead of filling a column.
  const columns = groupColumn && applied.groups ? applied.columns.filter((column) => column !== groupColumn) : applied.columns;
  const lead = columns.find((column) => column.kind === "text");
  const fills = new Set(columns.filter((column) => column === lead || column.kind === "relation"));
  const span = columns.length + 1 + (rowActions ? 1 : 0);

  const allSelected = applied.rows.length > 0 && applied.rows.every((row) => selectedIds.has(row.id));
  const someSelected = !allSelected && applied.rows.some((row) => selectedIds.has(row.id));
  const toggleAll = () => onSelect(allSelected ? new Set() : new Set(applied.rows.map((row) => row.id)));
  const toggle = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelect(next);
  };
  const setTotal = (key: string, fn: Aggregate | null) => {
    const totals = { ...view.totals };
    if (fn) totals[key] = fn;
    else delete totals[key];
    onViewChange({ ...view, totals });
  };

  // Rows are drawn up to the limit across groups, so a report with forty
  // groups of a hundred does not put four thousand rows in the page at once.
  const visible = rowsWithin(applied, limit, (group) => folded.has(groupId(group.value)));

  const renderRow = (row: ReportRow) => {
    const selected = selectedIds.has(row.id);
    return (
      <tr key={row.id} aria-selected={selected} data-selected={selected ? "true" : undefined}>
        <SelectCell checked={selected} onChange={() => toggle(row.id)} label="Select this row" />
        {columns.map((column) => (
          <Cell key={column.key} row={row} column={column} lead={column === lead} />
        ))}
        {rowActions ? <td className="rp-act">{rowActions(row)}</td> : null}
      </tr>
    );
  };

  const totalled = columns.filter((column) => view.totals[column.key]);
  const shownCount = applied.groups
    ? applied.groups.reduce((count, group) => count + (folded.has(groupId(group.value)) ? 0 : group.rows.length), 0)
    : applied.rows.length;

  return (
    <Kit contents>
      <div className="wt rp-wt">
        <table className="table">
          {/* The words columns share what is left; the rest take what they need, as the board sizes them. */}
          <colgroup>
            <col style={{ width: 40 }} />
            {columns.map((column) => (
              <col key={column.key} style={fills.has(column) ? { width: `${Math.round(100 / fills.size)}%` } : undefined} />
            ))}
            {rowActions ? <col style={{ width: 40 }} /> : null}
          </colgroup>
          <thead>
            <tr>
              <SelectCell
                head
                checked={allSelected}
                indeterminate={someSelected}
                onChange={toggleAll}
                label={allSelected ? "Clear selection" : "Select every row"}
              />
              {columns.map((column) => {
                const rule = view.sort.find((entry) => entry.column === column.key);
                const order = view.sort.length > 1 && rule ? view.sort.indexOf(rule) + 1 : null;
                return (
                  <th
                    key={column.key}
                    scope="col"
                    className={isNumeric(column.kind) ? "num" : undefined}
                    aria-sort={rule ? (rule.dir === "asc" ? "ascending" : "descending") : "none"}
                  >
                    <button
                      type="button"
                      className="rp-sort"
                      onClick={(event) => onViewChange({ ...view, sort: nextSort(view, column.key, event.shiftKey) })}
                    >
                      {column.label}
                      {rule ? <span aria-hidden="true">{rule.dir === "asc" ? "↑" : "↓"}</span> : null}
                      {order ? <span className="n">{order}</span> : null}
                    </button>
                  </th>
                );
              })}
              {rowActions ? (
                <th scope="col" className="rp-act">
                  <span className="sr-only">Actions</span>
                </th>
              ) : null}
            </tr>
          </thead>

          <tbody>
            {applied.groups
              ? applied.groups.map((group, groupIndex) => {
                  const id = groupId(group.value);
                  const isFolded = folded.has(id);
                  const name = group.value === null ? "None" : groupColumn ? formatValue(group.value, groupColumn) : String(group.value);
                  return (
                    <GroupRows key={id}>
                      <tr className="grp">
                        <td colSpan={span}>
                          <button
                            type="button"
                            className="rp-fold"
                            onClick={() => {
                              const next = new Set(folded);
                              if (isFolded) next.delete(id);
                              else next.add(id);
                              setFolded(next);
                            }}
                            aria-expanded={!isFolded}
                            aria-label={isFolded ? `Show ${name}` : `Fold ${name}`}
                          >
                            <Icon name={isFolded ? "chev" : "down"} />
                          </button>
                          {name}
                          <span className="n">{group.rows.length.toLocaleString("en-US")}</span>
                          <span className="rp-grp-sum">
                            {totalled.map((column) => (
                              <span key={column.key} className="num">
                                {totalled.length > 1 ? `${column.label} ` : null}
                                {formatTotal(group.totals[column.key], column, view.totals[column.key]!)}
                              </span>
                            ))}
                          </span>
                        </td>
                      </tr>
                      {visible[groupIndex]!.map(renderRow)}
                    </GroupRows>
                  );
                })
              : visible[0]!.map(renderRow)}
          </tbody>

          {/* Every column's foot holds its total, or a quiet way to add one. */}
          <tfoot className="rp-foot">
            <tr>
              <td className="rp-foot-l">Total</td>
              {columns.map((column) => (
                <td key={column.key} className={isNumeric(column.kind) ? "num" : undefined}>
                  <TotalMenu
                    column={column}
                    fn={view.totals[column.key]}
                    value={applied.totals[column.key]}
                    onChange={(fn) => setTotal(column.key, fn)}
                  />
                </td>
              ))}
              {rowActions ? <td /> : null}
            </tr>
          </tfoot>
        </table>

        {shownCount > limit ? (
          <div className="rp-more">
            <span className="num muted">
              {limit.toLocaleString()} of {shownCount.toLocaleString()}
            </span>
            <button type="button" className="btn btn-quiet" onClick={() => setLimit((current) => current + PAGE)}>
              Show more
            </button>
          </div>
        ) : null}
        <span className="sr-only" aria-live="polite">
          {`${applied.rows.length} rows`}
        </span>
      </div>
    </Kit>
  );
}

function GroupRows({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

function groupId(value: AppliedView["rows"][number][string]): string {
  return value === null || value === undefined ? "\u0000" : String(value);
}
