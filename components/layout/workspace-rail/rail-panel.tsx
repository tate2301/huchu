"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import { CaretLeft } from "@/lib/icons";

import styles from "./workspace-rail.module.css";

/**
 * The module panel (00-foundations 5.3.3): 240px on `--ground`, a 48px head
 * with the collapse chevron and the module's title, then its items. Nothing
 * else: no search, no New, no Help, no Management row.
 */
export function RailPanel({
  title,
  overlay,
  onCollapse,
  children,
  extra,
}: {
  title: string;
  /** Drawn over the page (720–1099px) rather than beside it. */
  overlay?: boolean;
  onCollapse?: () => void;
  children: React.ReactNode;
  /** The module's own extra section (the CRM's saved views). */
  extra?: React.ReactNode;
}) {
  return (
    <nav aria-label={title} className={cn(styles.panel, overlay && styles.panelOverlay)}>
      <div className={styles.panelHead}>
        {onCollapse ? (
          <button
            type="button"
            aria-label="Collapse the panel"
            aria-keyshortcuts="Meta+B Control+B"
            className={styles.collapse}
            onClick={onCollapse}
          >
            <CaretLeft className={styles.collapseIcon} />
          </button>
        ) : null}
        <span className={styles.panelTitle}>{title}</span>
      </div>
      <ul className={styles.items}>{children}</ul>
      {extra ? <div className={styles.extra}>{extra}</div> : null}
    </nav>
  );
}
