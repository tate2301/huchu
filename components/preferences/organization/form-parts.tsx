import * as React from "react";

import { cn } from "@/lib/utils";

import styles from "./organization.module.css";

/**
 * The bits of `General.dc.html` and `Billing.dc.html` the shared layer has no
 * shape for. The reasoning for each is in `organization.module.css`.
 *
 * All four are page furniture for two boards, not a contract the rest of the
 * surface has to honour — which is why they live here rather than in
 * `components/management/ui`.
 */

export function FormSection({
  children,
  count,
  action,
}: {
  children: React.ReactNode;
  /** Rule 7: a heading over a list carries its count. */
  count?: number;
  /** Rule 2: the section's own verb, right-aligned in the heading row. */
  action?: React.ReactNode;
}) {
  if (typeof count !== "number" && !action) {
    return <h3 className={styles.heading}>{children}</h3>;
  }

  return (
    <div className={styles.headingRow}>
      <h3 className={styles.heading}>{children}</h3>
      {typeof count === "number" ? (
        <span className={styles.count}>{count}</span>
      ) : null}
      {action ? (
        <>
          <span className={styles.spacer} />
          {action}
        </>
      ) : null}
    </div>
  );
}

export function FactRow({
  label,
  children,
  mono,
  action,
  className,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
  /** Figures and dates are mono + tabular so a column of them lines up. */
  mono?: boolean;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn(styles.row, className)}>
      <span className={styles.rowLabel}>{label}</span>
      <span className={mono ? styles.rowMono : styles.rowValue}>{children}</span>
      {action}
    </div>
  );
}

/**
 * Rows' worth of grey while the query is in flight, on the same 44px rhythm.
 *
 * The label bar sits inside a real `.rowLabel`, not a 92px box of its own:
 * the value column has to start at the same 150px+16 offset it will start at
 * once the data lands, or the whole page steps sideways when it does.
 */
export function FactRowsSkeleton({ rows = 3 }: { rows?: number }) {
  const widths = [188, 132, 164, 146, 120];

  return (
    <div role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className={styles.row}>
          <span className={styles.rowLabel}>
            <span className={styles.skeletonBar} style={{ width: 92 }} />
          </span>
          <span
            className={styles.skeletonBar}
            style={{ width: widths[index % widths.length] }}
          />
        </div>
      ))}
    </div>
  );
}

/** A failed load, kept on screen with the verb that fixes it. */
export function LoadFailure({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className={styles.failure}>
      <span className={styles.failureText}>{message}</span>
      <button type="button" onClick={onRetry} className={styles.failureRetry}>
        Retry
      </button>
    </div>
  );
}

/** What a section says when it has nothing in it. */
export function NothingHere({ children }: { children: React.ReactNode }) {
  return <p className={styles.empty}>{children}</p>;
}
