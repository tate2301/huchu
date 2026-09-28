"use client";

import { useState, type ReactNode } from "react";

import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { RecordCell, type RecordCellKind } from "@/components/records/record-table";
import { ArrowDownward, ArrowUpward, ChevronDown, ChevronRight } from "@/lib/icons";
import { formatTotal, formatValue, totalCaption } from "@/lib/reports/format";
import type { Aggregate, ReportColumn, ReportColumnKind, ReportRow, ReportView } from "@/lib/reports/types";
import { aggregatesFor, AGGREGATE_LABELS, isNumeric, rowsWithin, type AppliedView } from "@/lib/reports/view";
import { cn } from "@/lib/utils";

/**
 * A report's rows as a worksheet: sort from the headers, fold the groups,
 * choose each column's total from its foot, select rows to act on them.
 *
 * Presentational. It is handed the view already applied and says what should
 * change; the rows are never filtered or sorted here, because the same view has
 * to produce the same file on the server.
 */

/** How many rows are drawn before "Show more". Totals always cover every row. */
const PAGE = 400;

const CELL_KIND: Record<ReportColumnKind, RecordCellKind> = {
  text: "text",
  status: "text",
  code: "code",
  relation: "relation",
  email: "email",
  phone: "phone",
  date: "date",
  number: "number",
  money: "money",
};

const headCell =
  "border-b border-[var(--border)] bg-[var(--table-header-bg)] px-[13px] py-1.5 @5xl:sticky @5xl:top-[var(--stack-top,0px)] @5xl:z-[2]";
const bodyCell =
  "border-b border-[var(--table-divider)] px-[13px] py-1.5 align-middle text-sm [@media(pointer:coarse)]:py-2.5";

function Value({ row, column }: { row: ReportRow; column: ReportColumn }) {
  const value = row[column.key];
  const shown =
    value === null || value === undefined || value === ""
      ? null
      : column.kind === "number" || column.kind === "money" || column.kind === "date"
        ? formatValue(value, column)
        : typeof value === "boolean"
          ? formatValue(value, column)
          : String(value);
  return <RecordCell kind={CELL_KIND[column.kind]} value={shown} />;
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
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={fn ? `${column.label}: ${totalCaption(fn)}. Change the total` : `Total ${column.label}`}
          className={cn(
            "-mx-1.5 inline-flex max-w-full flex-col rounded-[var(--radius-sm)] px-1.5 py-0.5 hover:bg-[var(--canvas)]",
            isNumeric(column.kind) ? "items-end text-right" : "items-start text-left",
            !fn && "opacity-0 group-hover/foot:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100",
          )}
        >
          {fn ? (
            <>
              <span className="text-[11px] leading-[1.5] font-medium text-[var(--text-muted)]">{totalCaption(fn)}</span>
              <span className="truncate font-mono text-sm font-medium tabular-nums text-[var(--text-strong)]">
                {formatTotal(value, column, fn)}
              </span>
            </>
          ) : (
            <span className="text-[11px] leading-[1.5] font-medium text-[var(--text-muted)]">Total</span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={isNumeric(column.kind) ? "end" : "start"}>
        <DropdownMenuRadioGroup
          value={fn ?? "none"}
          onValueChange={(next) => onChange(next === "none" ? null : (next as Aggregate))}
        >
          {aggregatesFor(column.kind).map((option) => (
            <DropdownMenuRadioItem key={option} value={option}>
              {AGGREGATE_LABELS[option]}
            </DropdownMenuRadioItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuRadioItem value="none">None</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
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
  const { columns } = applied;
  const groupColumn = view.groupBy ? columns.find((column) => column.key === view.groupBy) ?? null : null;

  const allSelected = applied.rows.length > 0 && applied.rows.every((row) => selectedIds.has(row.id));
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
      <tr key={row.id} className={cn("group/row", selected ? "bg-[var(--brand-tint)]" : "hover:bg-[var(--canvas)]")}>
        <td className={cn(bodyCell, "w-10 px-2")}>
          <Checkbox checked={selected} onCheckedChange={() => toggle(row.id)} aria-label="Select this row" />
        </td>
        {columns.map((column) => (
          <td key={column.key} className={cn(bodyCell, "max-w-[22rem]", isNumeric(column.kind) && "text-right")}>
            <Value row={row} column={column} />
          </td>
        ))}
        {rowActions ? <td className={cn(bodyCell, "w-10 px-1")}>{rowActions(row)}</td> : null}
      </tr>
    );
  };

  const groupTotal = (column: ReportColumn, totals: AppliedView["totals"]) => {
    const fn = view.totals[column.key];
    return (
      <td key={column.key} className={cn(bodyCell, isNumeric(column.kind) && "text-right")}>
        {fn ? (
          <span className="font-mono text-sm font-medium tabular-nums text-[var(--text-strong)]">
            {formatTotal(totals[column.key], column, fn)}
          </span>
        ) : null}
      </td>
    );
  };

  const shownCount = applied.groups
    ? applied.groups.reduce((count, group) => count + (folded.has(groupId(group.value)) ? 0 : group.rows.length), 0)
    : applied.rows.length;

  return (
    <div className="table-edge-to-edge @container">
      <div className="overflow-x-auto @5xl:overflow-visible">
        <table className="w-full min-w-[46rem] border-separate border-spacing-0 text-left">
          <thead>
            <tr>
              <th scope="col" className={cn(headCell, "w-10 px-2")}>
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={toggleAll}
                  aria-label={allSelected ? "Clear selection" : "Select every row"}
                />
              </th>
              {columns.map((column) => {
                const rule = view.sort.find((entry) => entry.column === column.key);
                const order = view.sort.length > 1 && rule ? view.sort.indexOf(rule) + 1 : null;
                return (
                  <th
                    key={column.key}
                    scope="col"
                    aria-sort={rule ? (rule.dir === "asc" ? "ascending" : "descending") : "none"}
                    className={cn(headCell, "acct-col-head", isNumeric(column.kind) && "text-right")}
                  >
                    <button
                      type="button"
                      onClick={(event) =>
                        onViewChange({ ...view, sort: nextSort(view, column.key, event.shiftKey) })
                      }
                      className={cn(
                        "inline-flex max-w-full items-center gap-1 uppercase hover:text-[var(--text)]",
                        isNumeric(column.kind) && "flex-row-reverse",
                      )}
                    >
                      <span className="truncate">{column.label}</span>
                      {rule ? (
                        rule.dir === "asc" ? (
                          <ArrowUpward className="size-3 shrink-0" aria-hidden="true" />
                        ) : (
                          <ArrowDownward className="size-3 shrink-0" aria-hidden="true" />
                        )
                      ) : null}
                      {order ? <span className="font-mono text-[10px]">{order}</span> : null}
                    </button>
                  </th>
                );
              })}
              {rowActions ? (
                <th scope="col" className={cn(headCell, "w-10 px-1")}>
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
                  const name =
                    group.value === null ? "None" : groupColumn ? formatValue(group.value, groupColumn) : String(group.value);
                  return (
                    <GroupRows key={id}>
                      <tr className="bg-[var(--canvas)]">
                        <td className={cn(bodyCell, "w-10 px-2")}>
                          <button
                            type="button"
                            onClick={() => {
                              const next = new Set(folded);
                              if (isFolded) next.delete(id);
                              else next.add(id);
                              setFolded(next);
                            }}
                            aria-expanded={!isFolded}
                            aria-label={isFolded ? `Show ${name}` : `Fold ${name}`}
                            className="flex size-6 items-center justify-center rounded-[var(--radius-sm)] hover:bg-[var(--surface)]"
                          >
                            {isFolded ? <ChevronRight className="size-3.5" /> : <ChevronDown className="size-3.5" />}
                          </button>
                        </td>
                        {columns.map((column, index) =>
                          index === 0 ? (
                            <td key={column.key} className={cn(bodyCell, "font-medium text-[var(--text-strong)]")}>
                              <span className="flex items-baseline gap-2">
                                <span className="truncate">{name}</span>
                                <span className="font-mono text-[11px] tabular-nums text-[var(--text-muted)]">
                                  {group.rows.length}
                                </span>
                              </span>
                            </td>
                          ) : (
                            groupTotal(column, group.totals)
                          ),
                        )}
                        {rowActions ? <td className={bodyCell} /> : null}
                      </tr>
                      {visible[groupIndex]!.map(renderRow)}
                    </GroupRows>
                  );
                })
              : visible[0]!.map(renderRow)}
          </tbody>

          {/* Every column's foot holds its total, or a quiet way to add one. */}
          <tfoot>
            <tr className="group/foot">
              <td className="w-10 border-b border-[var(--table-divider)] px-2 py-1.5" />
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={cn(
                    "border-b border-[var(--table-divider)] px-[13px] py-1.5 align-top",
                    isNumeric(column.kind) && "text-right",
                  )}
                >
                  <TotalMenu
                    column={column}
                    fn={view.totals[column.key]}
                    value={applied.totals[column.key]}
                    onChange={(fn) => setTotal(column.key, fn)}
                  />
                </td>
              ))}
              {rowActions ? <td className="border-b border-[var(--table-divider)]" /> : null}
            </tr>
          </tfoot>
        </table>
      </div>

      {shownCount > limit ? (
        <div className="flex items-center justify-center gap-3 px-[13px] py-3 text-sm text-[var(--text-muted)]">
          <span className="font-mono tabular-nums">
            {limit.toLocaleString()} of {shownCount.toLocaleString()}
          </span>
          <button
            type="button"
            onClick={() => setLimit((current) => current + PAGE)}
            className="font-medium text-[var(--brand-strong)] hover:underline"
          >
            Show more
          </button>
        </div>
      ) : null}
      <span className="sr-only" aria-live="polite">
        {`${applied.rows.length} rows`}
      </span>
    </div>
  );
}

function GroupRows({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

function groupId(value: AppliedView["rows"][number][string]): string {
  return value === null || value === undefined ? "\u0000" : String(value);
}
