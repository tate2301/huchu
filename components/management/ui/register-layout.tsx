import * as React from "react";

import { cn } from "@/lib/utils";

import styles from "./settings.module.css";

export type RegisterLayoutProps = {
  /** The list column. Normally a `<ListColumn />`. */
  list: React.ReactNode;
  /** The record. Normally a `<RecordHeader />` and its sections. */
  children: React.ReactNode;
  /**
   * Whether a record is open. Below 900px the two columns stack and only one
   * can be on screen, so this is what decides which — the list until something
   * is picked, the record after. Defaults to `true`, which keeps a desktop-only
   * caller from having to think about it.
   */
  hasSelection?: boolean;
  /**
   * Below 900px, hide the list while a record is open. For a register whose
   * open record is the route, so the record carries its own way back
   * (`BackToList`) and the list is one tap away rather than stacked above it.
   */
  collapseList?: boolean;
  /**
   * Drawn on a page rather than inside the management surface's dialog: the
   * page's whole width and height under the app bar, edge to edge, as a
   * record page takes it (`.record-shell`).
   */
  page?: boolean;
  className?: string;
};

/**
 * A register: the list beside the record.
 *
 * `grid-template-columns: clamp(340px, 34%, 460px) minmax(0, 1fr)` — the list
 * grows with the window between 340 and 460 and never pins the record, and
 * `minmax(0, 1fr)` rather than `1fr` is what stops a long unbreakable value in
 * the record from pushing the grid wider than the surface.
 *
 * 34%, not the 30% written into `Main.dc.html`: Main's grid also contains the
 * 268px rail, so its percentage is of a different box. Every register board,
 * and §3 of the contract, say 34.
 */
export function RegisterLayout({
  list,
  children,
  hasSelection = true,
  collapseList = false,
  page = false,
  className,
}: RegisterLayoutProps) {
  const register = (
    <div
      className={cn(styles.register, className)}
      data-collapse-list={collapseList && hasSelection ? "true" : undefined}
    >
      <div className={styles.registerList}>{list}</div>
      <div
        className={styles.registerRecord}
        data-has-selection={hasSelection ? "true" : "false"}
      >
        {children}
      </div>
    </div>
  );
  return page ? <div className={cn("record-shell", styles.registerPage)}>{register}</div> : register;
}
