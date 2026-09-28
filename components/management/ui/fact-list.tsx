import * as React from "react";
import Link from "next/link";

import { cn } from "@/lib/utils";

import styles from "./settings.module.css";

export type FactListItem = {
  /** Defaults to the label, which is already unique in any list worth reading. */
  id?: string;
  label: string;
  value: React.ReactNode;
  /** Figures, codes and dates: mono and tabular. */
  mono?: boolean;
  /** `muted` for nothing-yet, `warn` and `danger` for a figure that needs somebody. */
  tone?: "default" | "muted" | "warn" | "danger";
  /** Where the value leads — the list the figure was counted from. */
  href?: string;
};

export type FactListProps = {
  items: FactListItem[];
  /**
   * `end` sets the values against the right edge, for a list of figures that
   * has to line up digit under digit. Default `start`, for facts that read.
   */
  align?: "start" | "end";
  /** Default 150, as the Profile board. */
  labelWidth?: number;
  /** Default 470, as RecordList. `null` fills whatever holds it — a dialog. */
  maxWidth?: number | null;
  className?: string;
};

/**
 * Facts about a record, one 44px row each: the label, then the value.
 *
 * No description under a label and no icon beside one (rules 1 and 10) — the
 * label is the whole explanation, and if it needs more the label is wrong.
 */
export function FactList({
  items,
  align = "start",
  labelWidth = 150,
  maxWidth = 470,
  className,
}: FactListProps) {
  return (
    <dl
      className={cn(styles.factList, className)}
      data-align={align}
      style={{ maxWidth: maxWidth ?? undefined, ["--fact-label-width" as string]: `${labelWidth}px` }}
    >
      {items.map((item) => (
        <div key={item.id ?? item.label} className={styles.factRow}>
          <dt className={styles.factLabel}>{item.label}</dt>
          <dd
            className={styles.factValue}
            data-mono={item.mono ? "true" : undefined}
            data-tone={item.tone && item.tone !== "default" ? item.tone : undefined}
          >
            {item.href ? (
              <Link href={item.href} className={styles.factLink}>
                {item.value}
              </Link>
            ) : (
              item.value
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}
