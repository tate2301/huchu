import * as React from "react";
import Link from "next/link";

import { ChevronRight } from "@/lib/icons";
import { cn } from "@/lib/utils";

import styles from "./settings.module.css";

export type ColumnListColumn = {
  id: string;
  /** Rule 6: what the column holds, in the header line, once. */
  label: string;
  /** Figures hang off the right edge so their digits line up. */
  align?: "start" | "end";
  /** Dropped below this width, when the row still reads without it. */
  hideBelow?: "sm" | "md";
};

export type ColumnListRow = {
  id: string;
  /** One node per column, keyed by the column's `id`. */
  cells: Record<string, React.ReactNode>;
  /** What the row opens onto, drawn under it. Needs `onToggle`. */
  detail?: React.ReactNode;
  expanded?: boolean;
  onToggle?: () => void;
};

export type ColumnListProps = {
  /** The table's accessible name — the section heading's words. */
  label: string;
  columns: ColumnListColumn[];
  rows: ColumnListRow[];
  /** A totals row, keyed like `cells`, under a full-ink rule. */
  total?: Record<string, React.ReactNode>;
  /**
   * Said once, in the meta ink, when there are no rows. Short: the section's
   * verb is on its heading, so this names the state and nothing else.
   */
  empty?: string;
  /** The measure the list and its heading share. Default 470, as RecordList. */
  maxWidth?: number;
  className?: string;
};

/**
 * A list inside a record that has more than one thing to say per row: a
 * requisition's amount and where it has got to, a line's day, receipt and
 * figure. `RecordList` with more value columns, drawn in the same ink:
 *
 * ```
 * Requisition                      Amount   Status
 * ───────────────────────────────────────────────────
 * REQ-0004  Diesel for the bakkie   60.00   ● Waiting
 * ```
 *
 * Only the first cell navigates, as in `RecordList` and `RecordTable`: a row
 * where every cell is the link is a row whose text cannot be selected.
 *
 * A row with a `detail` opens onto it. The name becomes the button, and the
 * detail is drawn under the row, indented past the chevron.
 */
export function ColumnList({
  label,
  columns,
  rows,
  total,
  empty,
  maxWidth = 470,
  className,
}: ColumnListProps) {
  if (rows.length === 0 && empty) {
    return (
      <p className={cn(styles.columnList, styles.columnEmpty, className)} style={{ maxWidth }}>
        {empty}
      </p>
    );
  }

  return (
    <div className={cn(styles.columnList, className)} style={{ maxWidth }}>
      <table className={styles.columnTable} aria-label={label}>
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.id}
                scope="col"
                className={styles.columnHead}
                data-align={column.align ?? "start"}
                data-hide={column.hideBelow}
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const opens = Boolean(row.detail && row.onToggle);
            return (
              <React.Fragment key={row.id}>
                <tr className={styles.columnRow} data-expanded={opens && row.expanded ? "true" : undefined}>
                  {columns.map((column, index) => (
                    <td
                      key={column.id}
                      className={styles.columnCell}
                      data-align={column.align ?? "start"}
                      data-hide={column.hideBelow}
                    >
                      {index === 0 && opens ? (
                        <button
                          type="button"
                          className={styles.columnToggle}
                          aria-expanded={Boolean(row.expanded)}
                          onClick={row.onToggle}
                        >
                          <ChevronRight aria-hidden="true" />
                          {row.cells[column.id]}
                        </button>
                      ) : (
                        row.cells[column.id]
                      )}
                    </td>
                  ))}
                </tr>
                {opens && row.expanded ? (
                  <tr>
                    <td colSpan={columns.length} className={styles.columnDetail}>
                      {row.detail}
                    </td>
                  </tr>
                ) : null}
              </React.Fragment>
            );
          })}
        </tbody>
        {total ? (
          <tfoot>
            <tr className={styles.columnTotal}>
              {columns.map((column) => (
                <td
                  key={column.id}
                  className={styles.columnCell}
                  data-align={column.align ?? "start"}
                  data-hide={column.hideBelow}
                >
                  {total[column.id]}
                </td>
              ))}
            </tr>
          </tfoot>
        ) : null}
      </table>
    </div>
  );
}

export type ColumnNameProps = {
  /** A person's mark — their initials or photo — ahead of everything else. */
  mark?: React.ReactNode;
  /** The mono reference in front of the name, when the row has one. */
  code?: string | null;
  name: React.ReactNode;
  /** One line under the name: what tells two similar rows apart. */
  meta?: React.ReactNode;
  /** Makes the name a link. The other cells stay outside it. */
  href?: string | null;
};

/** The first cell: the reference, the name, and one line under it. */
export function ColumnName({ mark, code, name, meta, href }: ColumnNameProps) {
  const body = (
    <>
      {mark ? <span className={styles.columnMark}>{mark}</span> : null}
      {code ? <span className={styles.recordListCode}>{code}</span> : null}
      <span className={styles.columnNameBody}>
        <span className={styles.columnNameText}>{name}</span>
        {meta ? <span className={styles.columnNameMeta}>{meta}</span> : null}
      </span>
    </>
  );

  if (href) {
    return (
      <Link href={href} className={styles.columnNameLink}>
        {body}
      </Link>
    );
  }
  return <span className={styles.columnName}>{body}</span>;
}

export type ColumnFigureProps = {
  children: React.ReactNode;
  /** `muted` for a figure that is nothing yet; `warn` and `danger` for one that needs somebody. */
  tone?: "default" | "muted" | "warn" | "danger";
};

/** A figure: mono, tabular, full ink unless it is saying something. */
export function ColumnFigure({ children, tone = "default" }: ColumnFigureProps) {
  return (
    <span className={styles.columnFigure} data-tone={tone === "default" ? undefined : tone}>
      {children}
    </span>
  );
}

/** Any other value: plain and muted, never mono. */
export function ColumnText({ children }: { children: React.ReactNode }) {
  return <span className={styles.columnText}>{children}</span>;
}

/**
 * A row's own verb — Remove on a line. Drawn on the row the pointer is over,
 * so a list of twenty lines is not a column of twenty bins; always drawn
 * where there is no hover to find it by.
 */
export function ColumnRowAction({ children }: { children: React.ReactNode }) {
  return <span className={styles.columnRowAction}>{children}</span>;
}
