"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Button, Icon } from "@/components/core";
import { MenuButton, type MenuEntry } from "@/components/core/menu";

/**
 * The parts every Books list board shares (books_pages_a.py `list_body`,
 * `tabs`, `ws_tools`, `foot`): the tabs with their counts under the finding,
 * then the search, the filter chips, the count and the quiet tools.
 */

export function BkTabs<V extends string>({
  label,
  items,
  value,
  onChange,
  className,
}: {
  label: string;
  items: Array<{ value: V; label: string; count?: number | null }>;
  value: V;
  onChange: (value: V) => void;
  /** `bk-rtabs` on a record page: the tabs under its figures, their line edge to edge. */
  className?: string;
}) {
  return (
    <div className={className ? `tabs bk-tabs ${className}` : "tabs bk-tabs"} role="tablist" aria-label={label}>
      {items.map((item) => (
        <button key={item.value} type="button" className="tab" role="tab" aria-selected={item.value === value} tabIndex={item.value === value ? 0 : -1} onClick={() => onChange(item.value)}>
          {item.label}
          {item.count !== undefined && item.count !== null ? <span className="n"> {item.count.toLocaleString("en-GB")}</span> : null}
        </button>
      ))}
    </div>
  );
}

/** A filter chip: "Customer Any ▾", its menu the choices. */
export function BkChip({ label, value, items, set = false }: { label: string; value: string; items: MenuEntry[]; set?: boolean }) {
  return (
    <MenuButton className={set ? "chipsel is-set" : "chipsel"} label={label} items={items}>
      {label} <b>{value}</b>
    </MenuButton>
  );
}

export function BkTools({
  find,
  query,
  onFind,
  chips,
  filters,
  count,
  end,
}: {
  find: string;
  query: string;
  onFind: (q: string) => void;
  chips?: React.ReactNode;
  /** The Filters button's menu (period and the like), when the list has more filters than its chips. */
  filters?: MenuEntry[];
  count: string;
  end?: React.ReactNode;
}) {
  const [q, setQ] = React.useState(query);
  const latest = React.useRef(onFind);
  React.useEffect(() => {
    latest.current = onFind;
  }, [onFind]);
  // Typing filters after a pause, not on every key.
  React.useEffect(() => {
    if (q === query) return;
    const timer = window.setTimeout(() => latest.current(q), 300);
    return () => window.clearTimeout(timer);
  }, [q, query]);
  return (
    <div className="ws-tools">
      <label className="input-wrap ws-find">
        <Icon name="search" />
        <input type="search" aria-label={find} placeholder={find} value={q} onChange={(event) => setQ(event.target.value)} />
      </label>
      {chips}
      {filters ? (
        <MenuButton icon="filter" iconEnd={undefined} label="Filters" items={filters}>
          Filters
        </MenuButton>
      ) : null}
      <span className="ws-n">{count}</span>
      {end ? (
        <div className="end">
          <span className="sepv" />
          {end}
        </div>
      ) : null}
    </div>
  );
}

/** Sort and Export, quiet, at the end of the tools. */
export function BkQuietTools({ onSort, sortLabel = "Sort", exportHref, extra, middle }: { onSort?: () => void; sortLabel?: string; exportHref?: string; extra?: React.ReactNode; /** Group and Columns, between Sort and Export. */ middle?: React.ReactNode }) {
  return (
    <>
      {extra}
      {onSort ? (
        <Button variant="quiet" icon="sort" onClick={onSort}>
          {sortLabel}
        </Button>
      ) : null}
      {middle}
      {exportHref ? (
        <a className="btn btn-quiet" href={exportHref} download>
          <Icon name="export" />
          Export
        </a>
      ) : null}
    </>
  );
}

/** The state word in a list's cell, toned as the boards tone it (`st`). */
export function BkState({ tone, children }: { tone: "info" | "success" | "warning" | "danger" | "void" | "plain"; children: React.ReactNode }) {
  if (tone === "void") return <span className="status" style={{ color: "var(--color-muted)" }}>{children}</span>;
  if (tone === "warning") return <span className="status status-warning" style={{ color: "var(--color-ink)", fontWeight: 500 }}>{children}</span>;
  if (tone === "plain") return <span className="status">{children}</span>;
  return <span className={`status status-${tone}`}>{children}</span>;
}

/** Download rows as a CSV file, in the browser: the selection's Export. */
export function downloadCsv(name: string, head: string[], rows: Array<Array<string | number>>) {
  const cell = (value: string | number) => {
    const text = String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const body = [head, ...rows].map((row) => row.map(cell).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([`${body}\n`], { type: "text/csv" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * A list's filters in the address: the query string to fetch with, and the
 * setter its tabs, chips and pages call. A value equal to its default (and
 * page 1) is left out, so the plain address is the default view.
 */
export function useListQuery<Q extends object>(defaults: Partial<Record<keyof Q, unknown>>) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const search = params.toString();
  const latest = React.useRef(defaults);
  const onQuery = React.useCallback(
    (next: Partial<Q>) => {
      const merged = new URLSearchParams(search);
      for (const [key, value] of Object.entries(next)) {
        const fallback = (latest.current as Record<string, unknown>)[key];
        const empty = value === null || value === undefined || value === "" || value === fallback || (key === "page" && value === 1);
        if (empty) merged.delete(key);
        else merged.set(key, String(value));
      }
      const query = merged.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [search, pathname, router],
  );
  const exportHref = (api: string) => `${api}?${new URLSearchParams([...params.entries(), ["format", "csv"]]).toString()}`;
  return { search, params, onQuery, exportHref };
}

export type BkCol = { key: string; label: string; /** Its place in the table, counting the select cell: the first column is never listed. */ nth: number };
export type BkGroup<T> = { key: string; label: string; by: (row: T) => string };

/**
 * Group and Columns for a list. What is hidden is remembered per person, per list;
 * grouping works on the rows of the page. `rows` draws the body, with a heading row
 * before each group; `wrap` scopes the hidden columns to this list's table.
 */
export function useBkLayout<T>(id: string, cols: BkCol[], groups: Array<BkGroup<T>>, source: T[]) {
  const storeKey = `bk.columns.${id}`;
  const [hidden, setHidden] = React.useState<string[]>([]);
  const [group, setGroup] = React.useState("none");
  React.useEffect(() => {
    try {
      const saved = window.localStorage.getItem(storeKey);
      if (saved) setHidden((JSON.parse(saved) as string[]).filter((key) => cols.some((col) => col.key === key)));
    } catch {
      /* A private window keeps nothing; the list still works. */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeKey]);
  const toggle = (key: string) =>
    setHidden((now) => {
      const next = now.includes(key) ? now.filter((item) => item !== key) : [...now, key];
      try {
        window.localStorage.setItem(storeKey, JSON.stringify(next));
      } catch {
        /* Not remembered. */
      }
      return next;
    });
  const active = groups.find((option) => option.key === group);
  const entries = React.useMemo(() => {
    if (!active) return source.map((row) => ({ row }) as { row: T } | { group: string; n: number });
    const names = [...new Set(source.map(active.by))].sort((a, b) => a.localeCompare(b, "en-GB"));
    return names.flatMap((name) => {
      const inside = source.filter((row) => active.by(row) === name);
      return [{ group: name, n: inside.length }, ...inside.map((row) => ({ row }))] as Array<{ row: T } | { group: string; n: number }>;
    });
  }, [source, active]);
  const hide = cols.filter((col) => hidden.includes(col.key));
  const css = hide.length
    ? `.bk-v-${id} :is(th,td,col):is(${hide.map((col) => `:nth-child(${col.nth})`).join(",")}){display:none}`
    : "";
  const total = Math.max(...cols.map((col) => col.nth), 1) + 1;
  const span = total - hide.length;
  const tools = (
    <>
      {groups.length ? (
        <MenuButton
          variant="quiet"
          icon="sections"
          label="Group"
          items={[{ key: "none", label: "No grouping", checked: group === "none", onSelect: () => setGroup("none") }, ...groups.map((option) => ({ key: option.key, label: option.label, checked: group === option.key, onSelect: () => setGroup(option.key) }))]}
        >
          Group
        </MenuButton>
      ) : null}
      <MenuButton variant="quiet" icon="eye" label="Columns" items={cols.map((col) => ({ key: col.key, label: col.label, checked: !hidden.includes(col.key), onSelect: () => toggle(col.key) }))}>
        Columns
      </MenuButton>
    </>
  );
  const rows = (render: (row: T) => React.ReactNode) =>
    entries.map((entry) =>
      "group" in entry ? (
        <tr key={`group-${entry.group}`} className="group">
          <td colSpan={span}>
            <b>{entry.group}</b> <span className="muted">{entry.n}</span>
          </td>
        </tr>
      ) : (
        render(entry.row)
      ),
    );
  const style = css ? <style>{css}</style> : null;
  return { tools, rows, style, wrap: `bk-v-${id}`, grouped: Boolean(active) };
}
