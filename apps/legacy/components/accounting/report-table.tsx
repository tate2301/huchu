"use client";

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * The accounting table, as the artboards draw it.
 *
 * ── Why this exists ────────────────────────────────────────────────────────
 *
 * Every accounting page ends in a table, and they were all being written by
 * hand from whatever grid classes were nearest — so a trial balance, an ageing
 * report and a statement each had their own row height, their own column
 * padding, their own idea of how a total is emphasised, and their own status
 * chip. The design has exactly one table and one cell vocabulary; this is it,
 * in one place, so a new report is a list of rows rather than a new layout.
 *
 * ── The vocabulary ─────────────────────────────────────────────────────────
 *
 * Cells are built with the helpers below rather than by passing style props,
 * because the choice is never "what colour" — it is "what kind of thing is
 * this". `amt` is a money figure, and money figures happen to be mono, right
 * aligned and semibold. Naming the meaning rather than the styling is what
 * stops the next report inventing a sixth way to render a number.
 *
 *   txt   plain text                     nm    a name — the row's subject
 *   amt   money, right aligned, mono     num   a bare number, right aligned
 *   dim   present but empty ("—")        total a subtotal or total line
 *   badge a status chip                  bar   a proportion with its figure
 *
 * ── Sticky headers ─────────────────────────────────────────────────────────
 *
 * The head pins at `--stack-top`, which the band stack publishes. On a page
 * with a page band it lands at 44; inside a view switcher, 88. No page states
 * a pixel offset.
 */

export type CellTone =
  | "body"
  | "strong"
  | "subtle"
  | "dim"
  | "total"
  | "ok"
  | "warn"
  | "bad";

const TONE_INK: Record<CellTone, string> = {
  body: "var(--text-body)",
  strong: "var(--text-strong)",
  subtle: "var(--text-subtle)",
  dim: "var(--gray-400)",
  total: "var(--brand-strong)",
  ok: "var(--badge-ok-fg)",
  warn: "var(--badge-warn-fg)",
  bad: "var(--badge-bad-fg)",
};

export type BadgeTone = "ok" | "warn" | "bad" | "info" | "mute";

type Align = "left" | "right";

type BaseCell = {
  align?: Align;
  /** Nested ledger lines — a sub-account under its parent. */
  indent?: boolean;
};

export type ReportCell = BaseCell &
  (
    | {
        kind: "text";
        text: ReactNode;
        tone?: CellTone;
        mono?: boolean;
        bold?: boolean;
      }
    | { kind: "badge"; text: string; tone: BadgeTone }
    | { kind: "bar"; text: string; pct: number; tone?: CellTone }
    | { kind: "node"; content: ReactNode }
  );

/** Plain text — a date, a method, a reason. */
export const txt = (text: ReactNode, o: Partial<ReportCell> = {}): ReportCell => ({
  kind: "text",
  text,
  tone: "body",
  ...o,
} as ReportCell);

/** The row's subject: a customer, an account, a line item. */
export const nm = (text: ReactNode, o: Partial<ReportCell> = {}): ReportCell => ({
  kind: "text",
  text,
  tone: "strong",
  bold: true,
  ...o,
} as ReportCell);

/** Money. Mono and right aligned so a column lines up on the decimal. */
export const amt = (text: ReactNode, o: Partial<ReportCell> = {}): ReportCell => ({
  kind: "text",
  text,
  tone: "strong",
  mono: true,
  bold: true,
  align: "right",
  ...o,
} as ReportCell);

/** A bare number — a count, a percentage, a day figure. */
export const num = (text: ReactNode, o: Partial<ReportCell> = {}): ReportCell => ({
  kind: "text",
  text,
  tone: "body",
  mono: true,
  align: "right",
  ...o,
} as ReportCell);

/**
 * Nothing here.
 *
 * An em dash rather than a blank cell or a zero: blank reads as a rendering
 * failure, and `0.00` in an "oldest invoice" column is a factual claim that
 * something is zero days old rather than absent.
 */
export const dim = (o: Partial<ReportCell> = {}): ReportCell => ({
  kind: "text",
  text: "—",
  tone: "dim",
  mono: true,
  align: "right",
  ...o,
} as ReportCell);

/** A subtotal or total line — brand ink, so it reads as arithmetic. */
export const total = (text: ReactNode, o: Partial<ReportCell> = {}): ReportCell => ({
  kind: "text",
  text,
  tone: "total",
  mono: true,
  bold: true,
  align: "right",
  ...o,
} as ReportCell);

export const badge = (text: string, tone: BadgeTone, o: Partial<ReportCell> = {}): ReportCell => ({
  kind: "badge",
  text,
  tone,
  ...o,
} as ReportCell);

export const bar = (text: string, pct: number, o: Partial<ReportCell> = {}): ReportCell => ({
  kind: "bar",
  text,
  pct,
  tone: "body",
  ...o,
} as ReportCell);

/** An escape hatch for a cell that is genuinely a control — a link, a button. */
export const node = (content: ReactNode, o: Partial<ReportCell> = {}): ReportCell => ({
  kind: "node",
  content,
  ...o,
} as ReportCell);

export type ReportColumn = { label: string; align?: Align };

export type ReportRow = {
  /** Stable key. Falls back to the row index when a report has no ids. */
  id?: string;
  cells: ReportCell[];
  href?: string;
  /**
   * Opens the row in place rather than navigating. A stage in the pipeline
   * editor carries a checklist, not a page of its own — `href` would send the
   * reader away from the table they came to audit.
   *
   * Ignored when `href` is set: a row is either a link or a disclosure.
   */
  onSelect?: () => void;
  /** Whether this row's `detail` is showing. Announced as `aria-expanded`. */
  expanded?: boolean;
  /**
   * What the row reveals when it is open. Rendered as a sibling below the row
   * rather than inside it, so it spans the full width instead of being cut up
   * by the tracks above it.
   */
  detail?: ReactNode;
  /**
   * Draws the row as a summary line: a heavier top rule and no hover. Used for
   * the total at the foot of a statement.
   */
  emphasis?: boolean;
};

const BAR_TONE: Record<string, string> = {
  body: "var(--brand)",
  ok: "var(--tone-success)",
  warn: "var(--tone-warn)",
  bad: "var(--tone-danger)",
  total: "var(--brand-strong)",
  strong: "var(--brand)",
  subtle: "var(--gray-400)",
  dim: "var(--gray-400)",
};

function Cell({ cell }: { cell: ReportCell }) {
  const align = cell.align ?? "left";

  if (cell.kind === "badge") {
    return (
      <div className={cn("min-w-0 pr-3", align === "right" && "text-right")}>
        <span className="acct-badge" data-tone={cell.tone}>
          {cell.text}
        </span>
      </div>
    );
  }

  if (cell.kind === "bar") {
    return (
      <div className="flex min-w-0 items-center gap-2 pr-3">
        <span className="h-[5px] min-w-0 flex-1 overflow-hidden rounded-[3px] bg-[var(--surface-muted)]">
          <span
            className="block h-[5px] rounded-[3px]"
            style={{
              width: `${Math.max(0, Math.min(100, cell.pct))}%`,
              background: BAR_TONE[cell.tone ?? "body"] ?? "var(--brand)",
            }}
          />
        </span>
        <span className="shrink-0 font-mono text-sm text-[var(--text-muted)]">{cell.text}</span>
      </div>
    );
  }

  if (cell.kind === "node") {
    return (
      <div className={cn("min-w-0 pr-3", align === "right" && "text-right")}>{cell.content}</div>
    );
  }

  return (
    <div
      className={cn(
        "min-w-0 truncate pr-3 text-sm",
        cell.mono && "font-mono tabular-nums",
        cell.bold ? "font-semibold" : "font-normal",
        align === "right" && "text-right",
        cell.indent && "pl-4",
      )}
      style={{ color: TONE_INK[cell.tone ?? "body"] }}
    >
      {cell.text}
    </div>
  );
}

export function ReportTable({
  columns,
  rows,
  tracks,
  emptyLabel = "Nothing to show.",
  label,
  className,
}: {
  columns: ReportColumn[];
  rows: ReportRow[];
  /** CSS grid tracks — `"minmax(0,1fr) 130px 120px"`. */
  tracks: string;
  emptyLabel?: string;
  /** Accessible name for the table. */
  label: string;
  className?: string;
}) {
  if (rows.length === 0) {
    return <p className="px-[13px] py-4 text-sm text-[var(--text-muted)]">{emptyLabel}</p>;
  }

  return (
    <div role="table" aria-label={label} className={cn("min-w-0", className)}>
      <div
        role="row"
        // Pins to whatever the band stack has reached. `--table-head-min-h` is
        // 32 in the compact density the accounting pages run at.
        className="acct-col-head sticky z-10 grid min-h-[var(--table-head-min-h)] items-center border-b border-[var(--border)] bg-[var(--table-header-bg)] px-[13px]"
        style={{ gridTemplateColumns: tracks, top: "var(--stack-top, 0px)" }}
      >
        {columns.map((column, index) => (
          <div
            role="columnheader"
            key={`${column.label}-${index}`}
            className={cn("truncate pr-3", column.align === "right" && "text-right")}
          >
            {column.label}
          </div>
        ))}
      </div>

      {rows.map((row, index) => {
        const content = row.cells.map((cell, cellIndex) => (
          <Cell key={cellIndex} cell={cell} />
        ));
        const rowClass = cn(
          "grid min-h-[var(--table-row-min-h)] items-center px-[13px]",
          row.emphasis
            ? "border-t border-[var(--border)] bg-[var(--canvas)]"
            : "border-b border-[var(--table-divider)]",
          (row.href || !row.emphasis) && "hover:bg-[var(--canvas)]",
        );

        const key = row.id ?? index;

        // The row and whatever it reveals are one unit, so the detail cannot
        // be separated from its row by the divider that follows it.
        const withDetail = (rowEl: ReactNode) =>
          row.detail && row.expanded ? (
            <div key={key} role="rowgroup">
              {rowEl}
              <div
                role="row"
                className="border-b border-[var(--table-divider)] bg-[var(--canvas)] px-[13px] py-2.5"
              >
                {row.detail}
              </div>
            </div>
          ) : (
            rowEl
          );

        if (row.href) {
          return withDetail(
            <a
              role="row"
              key={key}
              href={row.href}
              className={rowClass}
              style={{ gridTemplateColumns: tracks }}
            >
              {content}
            </a>,
          );
        }

        if (row.onSelect) {
          // A button rather than a div with a click handler: this is a
          // disclosure, and it has to be reachable and operable from the
          // keyboard like every other one in the module.
          return withDetail(
            <button
              type="button"
              role="row"
              key={key}
              aria-expanded={row.detail ? Boolean(row.expanded) : undefined}
              onClick={row.onSelect}
              className={cn(
                rowClass,
                "w-full text-left",
                row.expanded && "bg-[var(--canvas)]",
              )}
              style={{ gridTemplateColumns: tracks }}
            >
              {content}
            </button>,
          );
        }

        return withDetail(
          <div
            role="row"
            key={key}
            className={rowClass}
            style={{ gridTemplateColumns: tracks }}
          >
            {content}
          </div>,
        );
      })}
    </div>
  );
}
