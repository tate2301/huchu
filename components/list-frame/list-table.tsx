"use client";

import * as React from "react";

import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/workspace/menu";
import { ChevronDown, DotsThree } from "@/lib/icons";
import { fillTemplate } from "@/lib/reports/actions";
import type {
  ListAction,
  ListColumn,
  ListGroup,
  ListSpecPublic,
  ReportRow,
} from "@/lib/reports/types";

import { GroupHeading } from "./group-heading";
import { ListCell, cellTitle } from "./list-cell";
import { alignOf, cellPadding, groupValue, isBlank, rowMatches, sortOf } from "./model";

/**
 * The table (00-foundations 5.4.6): a column head pinned to the top of the
 * scroll box, group headings pinned under it, one 40px line per row, and the
 * totals band pinned to the bottom. Every row is the same grid —
 * `40px <the columns> 44px` — so heads, rows and totals line up to the pixel.
 */

export type RowEdit = {
  value: (row: ReportRow) => string;
  changed: (row: ReportRow) => boolean;
  refused: (row: ReportRow) => string | null;
  onChange: (row: ReportRow, value: string) => void;
};

type Props = {
  title: string;
  spec: ListSpecPublic;
  columns: ListColumn[];
  template: string;
  minWidth: number;
  total: number;
  sort: string;
  rows: ReportRow[];
  groups: ListGroup[] | null;
  groupKey: string | null;
  folded: ReadonlySet<string>;
  onFold: (value: string) => void;
  ticked: (id: string) => boolean;
  pageTicked: boolean;
  onTick: (row: ReportRow, index: number, range: boolean) => void;
  onTickPage: (on: boolean) => void;
  onSortColumn: (column: ListColumn) => void;
  focus: number | null;
  onRowAction: (action: ListAction, row: ReportRow) => void;
  edit?: RowEdit;
  stale: boolean;
  /** Under the head: skeleton rows, no match or an error, instead of rows. */
  body?: React.ReactNode;
  /** The totals band, last in the table so it pins to the bottom of the rows. */
  totals?: React.ReactNode;
};

/** The name a row goes by, for its tick and menu labels. */
function rowName(spec: ListSpecPublic, row: ReportRow): string {
  const first = spec.columns[0];
  return first ? String(row[first.key] ?? row.id) : row.id;
}

/** An `action` cell: the word that does one of the row's menu actions, when the row's menu has it. */
function RowActionCell({
  column,
  row,
  menu,
  onRowAction,
}: {
  column: ListColumn;
  row: ReportRow;
  menu: ListAction[];
  onRowAction: (action: ListAction, row: ReportRow) => void;
}) {
  const action = menu.find((candidate) => candidate.key === column.action);
  const words = row[column.key];
  if (!action || isBlank(words)) return null;
  return (
    <button type="button" className="cx-lf-actcell" onClick={() => onRowAction(action, row)}>
      {String(words)}
    </button>
  );
}

export function ListTable(props: Props) {
  const { spec, columns, template, rows, groups, groupKey, folded } = props;
  const by = sortOf(spec, props.sort);
  const last = columns.length - 1;
  const groupByValue = React.useMemo(
    () => new Map((groups ?? []).map((group) => [group.value ?? "", group])),
    [groups],
  );

  const lines: React.ReactNode[] = [];
  let currentGroup: string | null = null;
  rows.forEach((row, index) => {
    if (groupKey && groups) {
      const value = groupValue(row, groupKey);
      if (value !== currentGroup) {
        currentGroup = value;
        const group = groupByValue.get(value);
        if (group) {
          lines.push(
            <GroupHeading
              key={`group-${value}`}
              group={group}
              columns={columns}
              template={template}
              folded={folded.has(value)}
              onFold={() => props.onFold(value)}
            />,
          );
        }
      }
      if (folded.has(value)) return;
    }
    const href = fillTemplate(spec.rowHref, row);
    const isTicked = props.ticked(row.id);
    const name = rowName(spec, row);
    const menu = (spec.rowMenu ?? []).filter((action) => rowMatches(row, spec.columns, action.when));
    lines.push(
      <div
        key={row.id}
        role="row"
        aria-selected={isTicked}
        data-row-index={index}
        className={`cx-lf-g cx-lf-row${props.focus === index ? " is-focus" : ""}`}
        style={{ gridTemplateColumns: template }}
      >
        <div role="cell" className="cx-lf-tick">
          <input
            type="checkbox"
            className="cx-lf-check"
            aria-label={`Select ${name}`}
            checked={isTicked}
            onChange={() => undefined}
            onClick={(event) => props.onTick(row, index, event.shiftKey)}
          />
        </div>
        {columns.map((column, columnIndex) => (
          <div
            key={column.key}
            role="cell"
            title={column.cell === "duration" ? undefined : cellTitle(column, row) || undefined}
            className={`cx-lf-c${alignOf(column) === "end" ? " cx-lf-c--end" : ""}`}
            style={{ padding: cellPadding(column, columnIndex === last) }}
          >
            {column.cell === "action" ? (
              <RowActionCell column={column} row={row} menu={menu} onRowAction={props.onRowAction} />
            ) : (
              <ListCell
                column={column}
                row={row}
                rowHref={href}
                edit={
                  column.cell === "edit-money" && props.edit
                    ? {
                        value: props.edit.value(row),
                        changed: props.edit.changed(row),
                        refused: props.edit.refused(row),
                        onChange: (value) => props.edit!.onChange(row, value),
                        label: `New price for ${name}`,
                      }
                    : undefined
                }
              />
            )}
          </div>
        ))}
        <div role="cell" className="cx-lf-rowmenu">
          {menu.length ? (
            <Menu>
              <MenuTrigger asChild>
                <button type="button" aria-label={`Actions for ${name}`}>
                  <DotsThree weight="bold" aria-hidden />
                </button>
              </MenuTrigger>
              <MenuContent align="end" style={{ width: 240 }}>
                {menu.map((action, actionIndex) => (
                  <React.Fragment key={action.key}>
                    {action.separated && actionIndex > 0 ? <MenuSeparator /> : null}
                    <MenuItem danger={action.tone === "bad"} onSelect={() => props.onRowAction(action, row)}>
                      {fillTemplate(action.label, row, false) ?? action.label}
                    </MenuItem>
                  </React.Fragment>
                ))}
              </MenuContent>
            </Menu>
          ) : null}
        </div>
      </div>,
    );
  });

  return (
    <div
      role="table"
      aria-label={props.title}
      aria-rowcount={props.total}
      className={`cx-lf-table${props.stale ? " is-stale" : ""}`}
      style={{ minWidth: props.minWidth }}
    >
      <div role="row" className="cx-lf-g cx-lf-head" style={{ gridTemplateColumns: template }}>
        <div role="columnheader" className="cx-lf-tick">
          <input
            type="checkbox"
            className="cx-lf-check"
            aria-label={`Select every ${spec.noun.replace(/s$/, "")} on this page`}
            checked={props.pageTicked}
            disabled={rows.length === 0}
            onChange={(event) => props.onTickPage(event.target.checked)}
          />
        </div>
        {columns.map((column, columnIndex) => {
          const sorted = by?.column === column.key ? by.dir : null;
          const end = alignOf(column) === "end";
          return (
            <div
              key={column.key}
              role="columnheader"
              aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : column.sortable ? "none" : undefined}
              className={`cx-lf-c${end ? " cx-lf-c--end" : ""}`}
              style={{ padding: cellPadding(column, columnIndex === last, false) }}
            >
              {column.sortable ? (
                <button type="button" className="cx-lf-head__sort" onClick={() => props.onSortColumn(column)}>
                  {column.label}
                  {sorted ? (
                    <ChevronDown aria-hidden style={sorted === "asc" ? { transform: "rotate(180deg)" } : undefined} />
                  ) : null}
                </button>
              ) : (
                column.label
              )}
            </div>
          );
        })}
        <div role="columnheader">
          <span className="cx-lf-sr">Actions</span>
        </div>
      </div>
      <div role="rowgroup" className="cx-lf-body">
        {props.body ?? lines}
      </div>
      {props.totals}
    </div>
  );
}
