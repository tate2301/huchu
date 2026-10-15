"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import { Icon, Kit } from "@/components/core";
import { useShortcut } from "@/components/core/shortcuts";
import { byProduct, exploreTable, searchTables, PRODUCTS, type ExploreTable, type LockedTable } from "@/lib/explore/products";
import { exploreHref, questionHref } from "@/lib/explore/questions";
import type { HistoryEntry } from "@/lib/explore/runs";

import { useExploreReads } from "./explore-focus";
import { useExploreCatalog, useExploreHistory } from "./use-explore";

import "./explore.css";

type Tab = "data" | "templates" | "saved";

const TABS: Array<{ value: Tab; label: string }> = [
  { value: "data", label: "Your data" },
  { value: "templates", label: "Templates" },
  { value: "saved", label: "Saved" },
];

export function isExplorePath(pathname: string): boolean {
  return pathname === "/explore" || pathname.startsWith("/explore/");
}

/** A table in the panel: its name and rows, and its columns under it while it is open. */
function TableRow({ table, open, onToggle, columnsHit }: { table: ExploreTable & { rows?: number }; open: boolean; onToggle: () => void; columnsHit: string[] }) {
  const shown = open || columnsHit.length > 0;
  return (
    <>
      <button
        type="button"
        className={open ? "ex-t is-on" : "ex-t"}
        aria-expanded={shown}
        title={table.title}
        onClick={onToggle}
      >
        <Icon name="table" />
        <span className="ex-tn">{table.name}</span>
        {table.rows === undefined ? null : <span className="n">{table.rows.toLocaleString("en-GB")}</span>}
      </button>
      {shown ? (
        <div className="ex-cols">
          {(columnsHit.length ? columnsHit : table.columns.map((column) => column.sql)).join(" · ")}
          <Link className="ex-start" href={exploreHref({ sql: `select *\nfrom ${table.name};`, title: table.title })}>
            Start from {table.name}
          </Link>
        </div>
      ) : null}
    </>
  );
}

/** When a question ran, as the History lists it: "11:48" today, "Yesterday", or "14 Oct". */
function ranAt(iso: string, now = new Date()): string {
  const at = new Date(iso);
  const day = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const days = Math.round((day(now) - day(at)) / 86_400_000);
  if (days === 0) return at.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  if (days === 1) return "Yesterday";
  return at.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function rowsLabel(entry: HistoryEntry): string {
  if (entry.result === "TIMEOUT") return "stopped";
  if (entry.result === "FAILED" || entry.rows === null) return "did not run";
  return entry.rows === 1 ? "1 row" : `${entry.rows.toLocaleString("en-GB")} rows`;
}

/** A question the person ran: its words or first line, when, and how many rows. Opens it in the studio. */
function HistoryRow({ entry }: { entry: HistoryEntry }) {
  return (
    <Link
      className="ex-t ex-link ex-hist"
      href={exploreHref({ sql: entry.sql, title: entry.title && entry.title !== "Untitled question" ? entry.title : undefined })}
      title={entry.sql}
    >
      <Icon name="history" />
      <span className="ex-hist-b">
        <span className="ex-tn ex-sans">{entry.line}</span>
        <span className="ex-hist-m">
          {ranAt(entry.at)} · {rowsLabel(entry)}
        </span>
      </span>
    </Link>
  );
}

function LockedRow({ table }: { table: LockedTable }) {
  return (
    <div className="ex-t is-locked" title={`Only ${table.who} read ${table.name}`}>
      <Icon name="lock" />
      <span className="ex-tn">{table.name}</span>
      <span className="n">{table.who}</span>
    </div>
  );
}

/**
 * Explore's own panel (the ExploreStudio board's `aside.ex-nav`), in the
 * shell's place for a module panel: Your data (the tables by product, the
 * ones this person's role does not read marked with who does, and each one's
 * rows once Explore reads the real tables), Templates, and Saved with the
 * person's own History under it (the questions they ran here, newest first).
 * The search finds tables and columns; `/` focuses it.
 */
export function ExplorePanel() {
  const pathname = usePathname();
  const params = useSearchParams();
  const catalog = useExploreCatalog();
  const reads = useExploreReads();
  const onTemplates = pathname.startsWith("/explore/templates");
  const [tab, setTab] = React.useState<Tab>(onTemplates ? "templates" : "data");
  const [query, setQuery] = React.useState("");
  const [opened, setOpened] = React.useState<string | null>(null);
  const findRef = React.useRef<HTMLInputElement>(null);
  useShortcut("/", () => findRef.current?.focus());

  React.useEffect(() => {
    setTab(onTemplates ? "templates" : "data");
  }, [onTemplates]);

  const data = catalog.data?.canUse ? catalog.data : null;
  const history = useExploreHistory(Boolean(data) && tab === "saved");
  // The workspace's real tables with their rows, through Explore's own login; until it is set up, the report sources.
  const tables = React.useMemo<Array<ExploreTable & { rows?: number }>>(
    () => (data ? (data.engine === "tables" ? (data.tables ?? []) : data.sources.map(exploreTable)) : []),
    [data],
  );
  const hits = React.useMemo(() => searchTables(tables, query), [tables, query]);
  const hitColumns = new Map(hits.map((hit) => [hit.table.name, hit.columns]));
  const locked = (data?.locked ?? []).filter((table) => !query.trim() || table.name.includes(query.trim().toLowerCase()));
  const open = opened ?? reads[0] ?? null;

  const groups = byProduct([...hits.map((hit) => ({ ...hit.table, locked: null as LockedTable | null })), ...locked.map((table) => ({ ...table, locked: table }))]);
  const product = params.get("product");

  return (
    <Kit contents>
      <div className="seg ex-tabs" role="tablist" aria-label="Show">
        {TABS.map((item) => (
          <button key={item.value} type="button" role="tab" aria-selected={tab === item.value} tabIndex={tab === item.value ? 0 : -1} onClick={() => setTab(item.value)}>
            {item.label}
          </button>
        ))}
      </div>
      <label className="input-wrap pm-find ex-find">
        <Icon name="search" />
        <input
          ref={findRef}
          type="search"
          aria-label="Search tables and columns"
          placeholder="Search tables and columns"
          aria-keyshortcuts="/"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            if (event.target.value) setTab("data");
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape" && query) {
              event.preventDefault();
              setQuery("");
            }
          }}
        />
      </label>
      <div className="ex-body">
        {catalog.isPending ? (
          <div aria-busy="true" style={{ display: "flex", flexDirection: "column", gap: 8, paddingTop: 12 }}>
            {[0, 1, 2, 3, 4].map((n) => (
              <div key={n} className="skeleton" style={{ height: 24 }} />
            ))}
          </div>
        ) : catalog.isError ? (
          <p className="muted ex-none">The tables did not load.</p>
        ) : !data ? (
          <p className="muted ex-none">Explore is for {catalog.data && !catalog.data.canUse ? catalog.data.who.toLowerCase() : "owners and managers"}.</p>
        ) : tab === "data" ? (
          groups.length ? (
            groups.map((group) => (
              <React.Fragment key={group.product.key}>
                <div className="ex-prod">
                  <Icon name={group.product.icon} />
                  <span>{group.product.name}</span>
                </div>
                {group.tables.map((table) =>
                  table.locked ? (
                    <LockedRow key={table.name} table={table.locked} />
                  ) : (
                    <TableRow
                      key={table.name}
                      table={table as unknown as ExploreTable}
                      open={open === table.name}
                      columnsHit={query.trim() ? (hitColumns.get(table.name) ?? []) : []}
                      onToggle={() => setOpened(open === table.name ? "" : table.name)}
                    />
                  ),
                )}
              </React.Fragment>
            ))
          ) : (
            <p className="muted ex-none">No table or column is called “{query.trim()}”.</p>
          )
        ) : tab === "templates" ? (
          <>
            <div className="ex-prod">Questions to start from</div>
            {PRODUCTS.map((info) => {
              const count = data.templates.filter((template) => template.product === info.key).length;
              if (!count) return null;
              const on = onTemplates && product === info.key;
              return (
                <Link key={info.key} className={on ? "ex-t ex-link is-on" : "ex-t ex-link"} href={`/explore/templates?product=${info.key}`}>
                  <Icon name={info.icon} />
                  <span className="ex-tn">{info.name}</span>
                  <span className="n">{count}</span>
                </Link>
              );
            })}
          </>
        ) : (
          <>
            {data.saved.length ? (
              data.saved.map((question) => (
                <Link
                  key={question.id}
                  className={pathname === questionHref(question.id) ? "ex-t ex-link is-on" : "ex-t ex-link"}
                  href={questionHref(question.id)}
                >
                  <Icon name="sql" />
                  <span className="ex-tn ex-sans">{question.title}</span>
                </Link>
              ))
            ) : (
              <p className="muted ex-none">Questions you save are kept here, and in All reports.</p>
            )}
            <div className="ex-prod">
              <Icon name="history" />
              <span>History</span>
            </div>
            {history.isPending ? (
              <div aria-busy="true" className="ex-hist-wait">
                {[0, 1, 2].map((n) => (
                  <div key={n} className="skeleton" style={{ height: 36 }} />
                ))}
              </div>
            ) : history.isError ? (
              <p className="muted ex-none">
                The questions you ran did not load.{" "}
                <button type="button" className="ex-again" onClick={() => void history.refetch()}>
                  Try again
                </button>
              </p>
            ) : history.data?.runs.length ? (
              history.data.runs.map((entry) => <HistoryRow key={entry.id} entry={entry} />)
            ) : (
              <p className="muted ex-none">
                {history.data?.ready
                  ? "The questions you run are listed here, newest first. Only you see them."
                  : "Questions run in your browser for now, so none is kept. They are listed here once Explore’s own login is set up."}
              </p>
            )}
          </>
        )}
      </div>
    </Kit>
  );
}
