"use client";

import * as React from "react";

import { Button, Icon, SelectCell, useShortcut, type IconName } from "@/components/core";
import { MenuButton, type MenuEntry } from "@/components/core/menu";

/**
 * The worksheet: the one table every Books list is drawn with (`table.wt`,
 * design/books/html). One line per row, 40px on the owner's levels and 32px
 * on the accountant's (`dense`). Its bands carry `data-band` for the
 * worksheet test (design/books/tests/worksheet.spec.ts). J and K move the
 * row cursor, Enter opens it, X selects it.
 */

export type WsColumn<Row> = {
  key: string;
  head: React.ReactNode;
  /** Right-aligned: amounts and counts. */
  right?: boolean;
  /** The column's sort, when it sorts: pressing its head sorts by it. */
  sort?: string;
  cell: (row: Row) => React.ReactNode;
  /** A class on every cell of the column (`muted`, `mono`). */
  className?: string;
};

export type WsSort = { key: string; dir: "asc" | "desc" };

export function Worksheet<Row>({
  label,
  rows,
  rowKey,
  columns,
  dense = false,
  selection,
  onOpen,
  openHref,
  sort,
  onSort,
  totals,
  className,
  empty,
}: {
  /** What the rows are, for the select-all box and the table's name ("bills"). */
  label: string;
  rows: readonly Row[];
  rowKey: (row: Row) => string;
  columns: ReadonlyArray<WsColumn<Row>>;
  dense?: boolean;
  /** Selection on a list: the ids chosen and how to change them. */
  selection?: { selected: ReadonlySet<string>; toggle: (id: string) => void; toggleAll: () => void; all: boolean; some: boolean; labelOf: (row: Row) => string };
  /** Opens a row beside the list (peek). Enter on the cursor row does the same. */
  onOpen?: (row: Row) => void;
  /** The row's page, when a row is a link rather than a peek. */
  openHref?: (row: Row) => string | null;
  sort?: WsSort | null;
  onSort?: (sort: WsSort) => void;
  /** The totals row: one cell per column, in order (`tfoot.bkw-tot`). */
  totals?: ReadonlyArray<React.ReactNode> | null;
  className?: string;
  /** Drawn in place of the rows when there are none. */
  empty?: React.ReactNode;
}) {
  const [cursor, setCursor] = React.useState<number | null>(null);
  const bodyRef = React.useRef<HTMLTableSectionElement>(null);
  const keys = React.useMemo(() => rows.map(rowKey), [rows, rowKey]);

  const move = (step: 1 | -1) => {
    if (rows.length === 0) return;
    setCursor((at) => {
      const next = at == null ? (step === 1 ? 0 : rows.length - 1) : Math.min(rows.length - 1, Math.max(0, at + step));
      bodyRef.current?.querySelectorAll("tr")[next]?.scrollIntoView({ block: "nearest" });
      return next;
    });
  };
  const open = (row: Row) => {
    if (onOpen) onOpen(row);
    else {
      const href = openHref?.(row);
      if (href) window.location.assign(href);
    }
  };
  useShortcut("J", () => move(1));
  useShortcut("K", () => move(-1));
  useShortcut("Enter", () => (cursor != null && rows[cursor] ? open(rows[cursor]) : undefined), { enabled: cursor != null });
  useShortcut("X", () => (cursor != null && selection ? selection.toggle(keys[cursor]!) : undefined), { enabled: cursor != null && Boolean(selection) });

  const span = columns.length + (selection ? 1 : 0);
  return (
    <table className={["bkt", dense ? "dense" : null, className].filter(Boolean).join(" ")} aria-label={label}>
      <thead data-band="head">
        <tr>
          {selection ? (
            <SelectCell head checked={selection.all} indeterminate={selection.some} onChange={selection.toggleAll} label={`Select every ${label.replace(/s$/, "")}`} />
          ) : null}
          {columns.map((column) => {
            const sorted = Boolean(column.sort) && sort?.key === column.sort;
            return (
              <th
                key={column.key}
                className={[column.right ? "r" : null, sorted ? "is-sort" : null].filter(Boolean).join(" ") || undefined}
                aria-sort={sorted ? (sort!.dir === "asc" ? "ascending" : "descending") : undefined}
              >
                {column.sort && onSort ? (
                  <button
                    type="button"
                    className="k-th"
                    onClick={() => onSort({ key: column.sort!, dir: sorted && sort!.dir === "desc" ? "asc" : "desc" })}
                  >
                    {column.head}
                    {sorted ? <Icon name={sort!.dir === "asc" ? "hand" : "down"} /> : null}
                  </button>
                ) : (
                  column.head
                )}
              </th>
            );
          })}
        </tr>
      </thead>
      <tbody ref={bodyRef}>
        {rows.length === 0 && empty ? (
          <tr data-band="row">
            <td colSpan={span} className="k-none">
              {empty}
            </td>
          </tr>
        ) : (
          rows.map((row, index) => {
            const id = keys[index]!;
            const chosen = selection?.selected.has(id) ?? false;
            const clickable = Boolean(onOpen || openHref?.(row));
            return (
              <tr
                key={id}
                data-band="row"
                className={[chosen ? "is-sel" : null, cursor === index ? "is-cur" : null, clickable ? "is-open" : null].filter(Boolean).join(" ") || undefined}
                aria-selected={selection ? chosen : undefined}
                onClick={(event) => {
                  if (!clickable) return;
                  // A click on a control in the row (its box, a menu, a link) is that control's.
                  if ((event.target as HTMLElement).closest("a,button,input,label")) return;
                  setCursor(index);
                  open(row);
                }}
              >
                {selection ? <SelectCell checked={chosen} onChange={() => selection.toggle(id)} label={`Select ${selection.labelOf(row)}`} /> : null}
                {columns.map((column) => (
                  <td key={column.key} className={[column.right ? "r" : null, column.className].filter(Boolean).join(" ") || undefined}>
                    {column.cell(row)}
                  </td>
                ))}
              </tr>
            );
          })
        )}
      </tbody>
      {totals && rows.length > 0 ? (
        <tfoot className="bkw-tot" data-band="totals">
          <tr>
            {selection ? <td /> : null}
            {totals.map((cell, index) => (
              <td key={index} className={columns[index]?.right ? "r" : undefined}>
                {cell}
              </td>
            ))}
          </tr>
        </tfoot>
      ) : null}
    </table>
  );
}

/** The tabs under the finding (`.k-tabs`): each with its count in mono. Their own row. */
export function BkTabs<V extends string>({
  label,
  items,
  value,
  onChange,
}: {
  label: string;
  items: ReadonlyArray<{ value: V; label: string; count?: number | null; icon?: IconName }>;
  value: V;
  onChange: (value: V) => void;
}) {
  return (
    <div className="k-tabs" role="tablist" aria-label={label}>
      {items.map((item) => (
        <button
          key={item.value}
          type="button"
          role="tab"
          aria-selected={item.value === value}
          tabIndex={item.value === value ? 0 : -1}
          onClick={() => onChange(item.value)}
        >
          {item.icon ? <Icon name={item.icon} /> : null}
          {item.label}
          {item.count != null ? <span className="mono">{item.count.toLocaleString("en-GB")}</span> : null}
        </button>
      ))}
    </div>
  );
}

/** A filter on the tool row (`.bkw-f`): "Supplier Any ▾", its menu the choices. */
export function BkFilter({ label, value, items }: { label: string; value: string; items: MenuEntry[] }) {
  return (
    <MenuButton className="bkw-f" label={label} items={items}>
      {label} <b>{value}</b>
      <Icon name="down" />
    </MenuButton>
  );
}

/**
 * The tool row under the tabs (`.bkw-tools`, filters on the row below the
 * tabs): the list's own search, its filters, the count, then the quiet tools
 * at the end.
 */
export function BkTools({
  find,
  query,
  onFind,
  filters,
  count,
  end,
}: {
  /** What the search finds: "Search bills". */
  find: string;
  query: string;
  onFind: (query: string) => void;
  filters?: React.ReactNode;
  count?: number | null;
  end?: React.ReactNode;
}) {
  return (
    <div className="bkw-tools" data-band="toolbar">
      <label className="input-wrap" style={{ width: 220 }}>
        <Icon name="search" />
        <input type="search" aria-label={find} placeholder={find} value={query} onChange={(event) => onFind(event.target.value)} />
      </label>
      {filters}
      {count != null ? <span className="bkw-n">{count.toLocaleString("en-GB")}</span> : null}
      {end ? (
        <div className="end">
          <span className="bkw-sep" />
          {end}
        </div>
      ) : null}
    </div>
  );
}

/** The pager under a list (`.bkw-pager`): numbered pages, never an endless scroll. */
export function BkPager({ page, size, total, onPage }: { page: number; size: number; total: number; onPage: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / size));
  const from = total === 0 ? 0 : (page - 1) * size + 1;
  const to = Math.min(total, page * size);
  const shown = Array.from({ length: pages }, (_, index) => index + 1).filter((n) => n === 1 || n === pages || Math.abs(n - page) <= 1);
  return (
    <div className="bkw-pager" data-band="pager">
      <span>
        <span className="mono">
          {from}–{to}
        </span>{" "}
        of {total.toLocaleString("en-GB")} · Rows {size}
      </span>
      <div className="pg">
        <Button iconOnly icon="back" label="Previous page" className="keep" disabled={page <= 1} onClick={() => onPage(page - 1)} />
        {shown.map((n) => (
          <Button key={n} className={n === page ? "is-on keep" : undefined} aria-label={`Page ${n}`} aria-current={n === page ? "page" : undefined} onClick={() => onPage(n)}>
            {n}
          </Button>
        ))}
        <Button iconOnly icon="chev" label="Next page" className="keep" disabled={page >= pages} onClick={() => onPage(page + 1)} />
      </div>
      <span style={{ width: 120 }} />
    </div>
  );
}

/** The selection bar over a list's foot (`.k-sel`): how many, their sum, and what to do with them. */
export function BkSelectionBar({ count, sum, children, onClear }: { count: number; sum?: React.ReactNode; children: React.ReactNode; onClear: () => void }) {
  useShortcut("Escape", onClear, { enabled: count > 0 });
  if (count === 0) return null;
  return (
    <div className="k-sel" role="region" aria-label="Selection">
      <span>
        <b className="mono">{count}</b> selected
      </span>
      {sum ? <span className="k-ss">{sum}</span> : null}
      <div className="btn-group" role="group" aria-label="Do with the selection">
        {children}
      </div>
      <div className="k-sx">
        <Button variant="quiet" shortcut="Escape" onClick={onClear}>
          Clear
        </Button>
      </div>
    </div>
  );
}
