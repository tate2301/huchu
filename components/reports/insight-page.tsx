"use client";

import * as React from "react";
import Link from "next/link";

import { Button, ButtonLink, Empty, FigureStrip, Finding, Kit, Segmented, type IconName, type TabItem } from "@/components/core";
import { COMMON_PRESETS, DateRangePicker, type DayPreset } from "@/components/ui/date-picker";
import { dayRangeWords, todayIn } from "@/lib/workspace/format";

/**
 * One insight, as a page (PageInsightVisits, PageRetailSales, PageRetailLosses):
 * the period and the chips that choose what is read, the finding, four
 * figures, the charts that answer the question, the table behind them under
 * its views, and beside it all what to do about it. Sales, Site visits and
 * the shop's insights draw the same page from their own data; this is only
 * the drawing.
 */

const join = (...names: Array<string | false | null | undefined>) => names.filter(Boolean).join(" ");

/** The page inside the app's shell: edge to edge, scrolling inside itself. */
export function InsightFrame({ children }: { children: React.ReactNode }) {
  return (
    <Kit className="kit-main">
      <div className="mn">
        {children}
      </div>
    </Kit>
  );
}

export type Figure = {
  label: string;
  value: string;
  note?: string | null;
  tone?: "success" | "warning" | "danger";
};

/** The body and its aside. `tools` is the row of period and chips; the rest is the page's own. */
export function InsightPage({
  tools,
  finding,
  figures,
  aside,
  children,
}: {
  tools: React.ReactNode;
  finding?: { fact: React.ReactNode; rest?: React.ReactNode } | null;
  figures?: Figure[] | null;
  aside?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="ip">
      <div className="kbody">
        <div className="ws-tools ip-tools">{tools}</div>
        {finding ? <Finding fact={finding.fact} rest={finding.rest} /> : null}
        {figures && figures.length > 0 ? (
          <div className="rp-figs">
            <FigureStrip figures={figures.map((figure) => ({ ...figure, note: figure.note ?? undefined }))} />
          </div>
        ) : null}
        {children}
      </div>
      {aside ? <aside className="kaside ip-aside">{aside}</aside> : null}
    </div>
  );
}

/**
 * Nothing in the period: the kit's Empty in place of the finding, the figures and the charts, which
 * would only draw zeros. It offers the next wider period when there is one.
 */
export function InsightEmpty({
  icon = "reports",
  title,
  children,
  wider,
}: {
  icon?: IconName;
  title: React.ReactNode;
  children?: React.ReactNode;
  wider?: { label: string; onShow: () => void } | null;
}) {
  return (
    <Empty
      icon={icon}
      title={title}
      action={
        wider ? (
          <Button icon="calendar" onClick={wider.onShow}>
            {`Show ${wider.label.charAt(0).toLowerCase()}${wider.label.slice(1)}`}
          </Button>
        ) : undefined
      }
    >
      {children}
    </Empty>
  );
}

/** The period after `current` in a page's list, the next wider one; none past the widest or for a range. */
export function widerPeriod<V extends string>(periods: ReadonlyArray<{ value: V; label: string }>, current: V | null, ranged: boolean): { value: V; label: string } | null {
  if (ranged) return null;
  const at = periods.findIndex((entry) => entry.value === current);
  return at >= 0 ? (periods[at + 1] ?? null) : null;
}

/** Loading: the page's shape in grey. */
export function InsightLoading() {
  return (
    <div className="ip" aria-busy="true" aria-label="Loading">
      <div className="kbody">
        <div className="ws-tools ip-tools">
          <div className="skeleton" style={{ height: 32, width: 240 }} />
          <div className="skeleton" style={{ height: 32, width: 96 }} />
        </div>
        <div className="finding">
          <div className="skeleton" style={{ height: 28, width: "70%" }} />
          <div className="skeleton" style={{ height: 28, width: "55%", marginTop: 8 }} />
        </div>
        <div className="rp-figs">
          <div className="skeleton" style={{ height: 76 }} />
        </div>
        <div className="rp-grid2">
          <div className="rp-block" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {Array.from({ length: 6 }, (_, index) => (
              <div key={index} className="skeleton" style={{ height: 22 }} />
            ))}
          </div>
          <div className="rp-block">
            <div className="skeleton" style={{ height: 176 }} />
          </div>
        </div>
      </div>
    </div>
  );
}

/** What failed, and Try again. */
export function InsightError({ message, onRetry, children }: { message: string; onRetry: () => void; children?: React.ReactNode }) {
  const offline = typeof navigator !== "undefined" && !navigator.onLine;
  return (
    <Empty
      icon="warn"
      title={offline ? "You are offline" : "This insight did not load"}
      action={
        children ?? (
          <Button icon="history" onClick={onRetry}>
            Try again
          </Button>
        )
      }
    >
      {message}
    </Empty>
  );
}

/* ── Tools ───────────────────────────────────────────────────────────────── */

export type Days = { from: string; to: string };

/** The period: its preset tabs, and Range for days of one's own (which leaves the tabs unset). */
export function PeriodTools<V extends string>({
  periods,
  period,
  onPeriod,
  days,
  onDays,
  onClearDays,
  presets = COMMON_PRESETS,
  maxDays,
}: {
  periods: ReadonlyArray<{ value: V; label: string }>;
  /** The picker's own ranges; the common ones unless the page has its own. */
  presets?: ReadonlyArray<DayPreset>;
  maxDays?: number;
  /** Null while days of one's own are chosen. */
  period: V | null;
  onPeriod: (value: V) => void;
  days: Days | null;
  onDays: (days: Days) => void;
  onClearDays: () => void;
}) {
  const words = days ? dayRangeWords(days, todayIn()) : null;
  return (
    <>
      <Segmented
        label="Period"
        items={periods.map((entry) => ({ value: entry.value, label: entry.label }))}
        value={(period ?? "") as V}
        onChange={onPeriod}
      />
      <DateRangePicker
        presets={presets}
        maxDays={maxDays}
        title="Range"
        value={{ from: days?.from ?? null, to: days?.to ?? null }}
        onChange={(next) => {
          if (next.from && next.to) onDays({ from: next.from, to: next.to });
          else onClearDays();
        }}
        trigger={
          <Button icon="calendar" className={days ? "is-set" : undefined} aria-label={words ? `Range: ${words}` : "Range"}>
            {words ?? "Range"}
          </Button>
        }
      />
    </>
  );
}

/* ── Blocks ──────────────────────────────────────────────────────────────── */

/** A titled block of the page: a chart, bars or a list, with what it measures beside the title. */
export function InsightBlock({
  title,
  sum,
  legend,
  children,
}: {
  title: string;
  sum?: string | null;
  legend?: Array<{ label: string; color: string }> | null;
  children: React.ReactNode;
}) {
  return (
    <section className="kblock rp-block">
      <div className="kblock-h">
        <h3>{title}</h3>
        {sum ? <span className="sum">{sum}</span> : null}
        {legend && legend.length > 0 ? (
          <span className="ip-legend">
            {legend.map((entry) => (
              <span key={entry.label} className="ip-lg">
                <i style={{ background: entry.color }} />
                {entry.label}
              </span>
            ))}
          </span>
        ) : null}
      </div>
      {children}
    </section>
  );
}

export type Bar = { id: string; label: string; share: number; text: string; tone?: "warning" | "danger" | "success" | "key" | null };

const BAR_COLOR: Record<NonNullable<Bar["tone"]>, string> = {
  warning: "var(--color-warning)",
  danger: "var(--color-danger)",
  success: "var(--color-success)",
  key: "var(--color-accent)",
};

/** Bars across: a label, its share of the longest (0 to 1), and the figure. */
export function HBars({ rows, empty }: { rows: Bar[]; empty?: string }) {
  if (rows.length === 0) return <p className="muted">{empty ?? "Nothing to show in these dates."}</p>;
  return (
    <>
      {rows.map((row) => (
        <div key={row.id} className="hbar ip-hbar">
          <span className="truncate" title={row.label}>
            {row.label}
          </span>
          <span className="hbar-t">
            <i
              style={{
                width: `${Math.max(0, Math.min(1, row.share)) * 100}%`,
                background: row.tone ? BAR_COLOR[row.tone] : "var(--color-muted)",
              }}
            />
          </span>
          <span className="num">{row.text}</span>
        </div>
      ))}
    </>
  );
}

export type Column = { label: string; parts: Array<{ value: number; color: string; title?: string }> };

/** Columns, one per day or week, stacked when they have parts; the labels underneath. */
export function Columns({ columns, labels, empty }: { columns: Column[]; labels: string[]; empty?: string }) {
  const top = Math.max(0, ...columns.map((column) => column.parts.reduce((sum, part) => sum + Math.max(0, part.value), 0)));
  if (columns.length === 0 || top === 0) return <p className="muted">{empty ?? "Nothing in these dates."}</p>;
  // Every label on a short run; on a long one, every few so they do not run together.
  const every = Math.max(1, Math.ceil(columns.length / 8));
  return (
    <>
      <div className="cols ip-cols">
        {columns.map((column, index) => (
          <div
            key={`${column.label}-${index}`}
            className="col"
            title={[column.label, ...column.parts.filter((part) => part.title).map((part) => part.title)].join(" · ")}
          >
            {[...column.parts].reverse().map((part, at) =>
              part.value > 0 ? (
                <i
                  key={at}
                  style={{
                    height: `${(part.value / top) * 100}%`,
                    background: part.color,
                    borderRadius: at === 0 ? undefined : 0,
                  }}
                />
              ) : null,
            )}
          </div>
        ))}
      </div>
      <div className="cols-x">
        {labels.map((label, index) => (
          <span key={`${label}-${index}`}>{index % every === 0 ? label : ""}</span>
        ))}
      </div>
    </>
  );
}

/** Days down, hours across, darker is more. `null` is an hour the place is shut. */
export function HeatGrid({
  rows,
  columns,
  values,
  format,
}: {
  rows: string[];
  columns: string[];
  values: Array<Array<number | null>>;
  format: (value: number) => string;
}) {
  const top = Math.max(0, ...values.flat().map((value) => value ?? 0));
  return (
    <div className="ip-heat" style={{ gridTemplateColumns: `40px repeat(${columns.length}, minmax(0, 1fr))` }}>
      <span />
      {columns.map((column) => (
        <span key={column} className="ip-heat-x">
          {column}
        </span>
      ))}
      {rows.map((row, r) => (
        <React.Fragment key={row}>
          <span className="ip-heat-y">{row}</span>
          {columns.map((column, c) => {
            const value = values[r]?.[c] ?? null;
            const share = value === null || top === 0 ? 0 : value / top;
            return (
              <span
                key={column}
                className="ip-heat-c"
                title={value === null ? `${row} ${column}: shut` : `${row} ${column}: ${format(value)}`}
                style={{
                  background:
                    value === null
                      ? "transparent"
                      : `color-mix(in oklab, var(--color-accent) ${Math.round(8 + share * 72)}%, var(--color-surface))`,
                  boxShadow: value === null ? "inset 0 0 0 1px var(--color-line)" : undefined,
                }}
              />
            );
          })}
        </React.Fragment>
      ))}
    </div>
  );
}

/* ── The table and its views ─────────────────────────────────────────────── */

export type Cell = { text: string; tone?: "success" | "danger" | "warning" | "muted" | null; href?: string | null };

export type InsightTable = {
  id: string;
  label: string;
  columns: Array<{ id: string; label: string; num?: boolean }>;
  rows: Array<{ id: string; cells: Record<string, Cell | null>; muted?: boolean }>;
  total?: { label: string; cells: Record<string, Cell | null> } | null;
  empty: string;
};

const TONE: Record<NonNullable<Cell["tone"]>, React.CSSProperties> = {
  success: { color: "var(--color-success)", fontWeight: 500 },
  danger: { color: "var(--color-danger)", fontWeight: 500 },
  warning: { color: "var(--color-warning)", fontWeight: 500 },
  muted: { color: "var(--color-muted)" },
};

function CellView({ cell, first }: { cell: Cell | null | undefined; first: boolean }) {
  if (!cell) return <>—</>;
  if (cell.href && first) {
    return (
      <Link href={cell.href} className="link">
        {cell.text}
      </Link>
    );
  }
  return <>{cell.text}</>;
}

/** A table on the page: the first column fills and links, the figures sit right, a total underneath. */
export function InsightTableView({ table, title }: { table: InsightTable; title?: string }) {
  return (
    <div className="wt rp-table">
      {title ? <h3 className="ip-table-h">{title}</h3> : null}
      {/* Empty, the columns stay so it is plain what would be here. */}
        <div className="rp-wt">
          <table className="table">
            <colgroup>
              {table.columns.map((column, index) => (
                <col key={column.id} style={index === 0 ? { width: "100%" } : undefined} />
              ))}
            </colgroup>
            <thead>
              <tr>
                {table.columns.map((column, index) => (
                  <th key={column.id} className={join(column.num && "num", index > 0 && "nowrap")}>
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.length === 0 ? (
                <tr>
                  <td colSpan={table.columns.length} className="muted ip-empty">
                    {table.empty}
                  </td>
                </tr>
              ) : null}
              {table.rows.map((row) => (
                <tr key={row.id}>
                  {table.columns.map((column, index) => {
                    const cell = row.cells[column.id];
                    return (
                      <td
                        key={column.id}
                        className={join(index === 0 && "fill", (column.num || index > 0) && "num", (row.muted && index === 0) || cell?.tone === "muted" ? "muted" : null)}
                        style={cell?.tone && cell.tone !== "muted" ? TONE[cell.tone] : undefined}
                      >
                        {index === 0 ? (
                          <span className="cell-lead truncate">
                            <CellView cell={cell} first />
                          </span>
                        ) : (
                          <CellView cell={cell} first={false} />
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
            {table.total && table.rows.length > 0 ? (
              <tfoot>
                <tr>
                  {table.columns.map((column, index) => (
                    <td key={column.id} className={index === 0 ? "fill" : "num"}>
                      {index === 0 ? table.total!.label : <CellView cell={table.total!.cells[column.id]} first={false} />}
                    </td>
                  ))}
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
    </div>
  );
}

/** The views of the table ("By category", "By till"), then the table that is chosen. */
export function InsightTables({
  tables,
  value,
  onChange,
}: {
  tables: InsightTable[];
  value: string;
  onChange: (id: string) => void;
}) {
  if (tables.length === 0) return null;
  const shown = tables.find((table) => table.id === value) ?? tables[0]!;
  const items: TabItem[] = tables.map((table) => ({ value: table.id, label: table.label }));
  return (
    <>
      {tables.length > 1 ? (
        <div className="tools ip-views">
          <Segmented label="View" items={items} value={shown.id} onChange={onChange} />
        </div>
      ) : null}
      <InsightTableView table={shown} />
    </>
  );
}

/* ── Aside ───────────────────────────────────────────────────────────────── */

export type InsightCard = {
  key: string;
  title?: string | null;
  body?: string | null;
  action: { label: string; icon?: IconName; href?: string; onClick?: () => void; busy?: boolean; disabled?: boolean };
};

/** Do something about it: each card a finding and the one act it asks for. Then Send me this. */
export function InsightAside({
  cards,
  send,
}: {
  cards: InsightCard[];
  /** Send me this: what is sent, and where Send it goes. */
  send?: { words: string; href: string } | null;
}) {
  if (cards.length === 0 && !send) return null;
  return (
    <>
      {cards.length > 0 ? <span className="sec-title">Do something about it</span> : null}
      {cards.map((card) => (
        <div key={card.key} className="card ip-card">
          {card.title ? <b>{card.title}</b> : null}
          {card.body ? <span className="ip-card-t">{card.body}</span> : null}
          <span>
            {card.action.href ? (
              <ButtonLink href={card.action.href} icon={card.action.icon}>
                {card.action.label}
              </ButtonLink>
            ) : (
              <Button icon={card.action.icon} onClick={card.action.onClick} busy={card.action.busy} disabled={card.action.disabled}>
                {card.action.label}
              </Button>
            )}
          </span>
        </div>
      ))}
      {send ? (
        <section className="ip-send">
          <span className="sec-title">Send me this</span>
          <span className="ip-card-t">{send.words}</span>
          <span>
            <ButtonLink href={send.href} icon="send">
              Send it
            </ButtonLink>
          </span>
        </section>
      ) : null}
    </>
  );
}
