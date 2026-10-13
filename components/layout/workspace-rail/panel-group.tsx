"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import { ChevronDown as CaretDown } from "@/lib/icons";

import styles from "./workspace-rail.module.css";

/**
 * A band of rows in a module's panel, under a 28px head (the boards' `.pg`):
 * Ledger, Saved views, Reports from Books. The chevron folds the band; a band
 * that holds the page being looked at always opens.
 */
export function PanelGroup({
  label,
  action,
  defaultOpen = true,
  holdsCurrent = false,
  children,
}: {
  label: string;
  /** A control at the right of the head: Add to Saved views. */
  action?: React.ReactNode;
  defaultOpen?: boolean;
  holdsCurrent?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(defaultOpen || holdsCurrent);
  const [followed, setFollowed] = React.useState(holdsCurrent);
  if (holdsCurrent !== followed) {
    setFollowed(holdsCurrent);
    if (holdsCurrent) setOpen(true);
  }
  const rowsId = React.useId();
  return (
    <li className={cn(styles.group, !open && styles.groupClosed)}>
      <h2 className={styles.groupHead}>
        <button
          type="button"
          className={styles.groupToggle}
          aria-expanded={open}
          aria-controls={rowsId}
          onClick={() => setOpen((value) => !value)}
        >
          <CaretDown className={styles.groupChevron} aria-hidden="true" />
          <span>{label}</span>
        </button>
        {action}
      </h2>
      <ul id={rowsId} className={styles.groupRows} hidden={!open}>
        {children}
      </ul>
    </li>
  );
}
