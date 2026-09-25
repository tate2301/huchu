import * as React from "react";
import Link from "next/link";

import { cn } from "@/lib/utils";

import { StatusDot, type StatusTone } from "./status";
import styles from "./settings.module.css";

/**
 * The right-hand column of a record list, as a discriminated union rather than
 * a free `ReactNode`, because the three cases are drawn differently and the
 * difference is not cosmetic:
 *
 *   - `number` — mono, tabular, right-aligned, so a column of figures lines up
 *     digit under digit.
 *   - `status` — a 6px coloured dot and the word in that state's ink. Never a
 *     chip: a column of chips reads as a column of buttons.
 *   - `text`   — plain and muted. Never mono; mono on a word says "identifier"
 *     and this is not one.
 */
export type RecordListValue =
  | { kind: "number"; value: number | string }
  | { kind: "status"; tone: StatusTone; label: string }
  | { kind: "text"; value: string };

export type RecordListRow = {
  id: string;
  /** The mono code, when the row has one. */
  code?: string;
  name: string;
  value?: RecordListValue;
  /** Makes the row's name a link. The value column stays outside it. */
  href?: string;
};

export type RecordListProps = {
  /** Rule 6 again: `{ row: "Stream", value: "Pupils" }`. */
  columns: { row: string; value?: string };
  rows: RecordListRow[];
  /**
   * The fixed width the value column and its header share, so the header label
   * sits exactly over the values. Default 52.
   */
  valueWidth?: number;
  maxWidth?: number;
  className?: string;
};

/**
 * A list inside a record: the column header line, then the rows.
 *
 * Not `DataTable` and not the design system's `.dtable`. `.dtable` draws its
 * column headers uppercase with `.08em` tracking in `#8A91A0` — three
 * separate violations of the contract's list rules in one selector, one of
 * which (the ink) fails 4.5:1 on white. Overriding all three at a call site is
 * how two of them come back.
 */
export function RecordList({
  columns,
  rows,
  valueWidth = 52,
  maxWidth = 470,
  className,
}: RecordListProps) {
  return (
    <>
      <div className={styles.recordListColumns} style={{ maxWidth }}>
        <span className={styles.listColumnRow}>{columns.row}</span>
        {columns.value ? (
          <span className={styles.listColumnValue} style={{ minWidth: valueWidth }}>
            {columns.value}
          </span>
        ) : null}
      </div>
      <ul className={cn(styles.recordList, className)} style={{ maxWidth }}>
        {rows.map((row) => (
          <li key={row.id} className={styles.recordListRow}>
            {row.href ? (
              <Link href={row.href} className={styles.recordListLink}>
                <RowBody row={row} />
              </Link>
            ) : (
              <RowBody row={row} />
            )}
            {row.value ? (
              <span className={styles.recordListValue} style={{ minWidth: valueWidth }}>
                <RowValue value={row.value} />
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </>
  );
}

function RowBody({ row }: { row: RecordListRow }) {
  return (
    <>
      {row.code ? <span className={styles.recordListCode}>{row.code}</span> : null}
      <span className={styles.recordListName}>{row.name}</span>
    </>
  );
}

function RowValue({ value }: { value: RecordListValue }) {
  if (value.kind === "number") {
    return <span className={styles.recordListNumber}>{value.value}</span>;
  }
  if (value.kind === "status") {
    return <StatusDot tone={value.tone} label={value.label} />;
  }
  return <span className={styles.recordListText}>{value.value}</span>;
}
