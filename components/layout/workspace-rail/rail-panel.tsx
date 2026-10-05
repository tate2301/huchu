"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import { CaretLeft, MagnifyingGlass, SidebarSimple } from "@/lib/icons";

import styles from "./workspace-rail.module.css";

/**
 * The panel beside the rail (00-foundations 5.3.3, `Main.dc.html`): 240px on
 * `--ground`.
 *
 * Its 48px head is either the workspace (the module list) or the module you
 * are in, with the chevron before the title going back to the module list.
 * Collapsing the panel is its own button at the right of the head (and
 * Cmd/Ctrl+B). Search sits under the head in both, because it is about the
 * whole workspace. The shelf at the foot holds Help and Management.
 */
export function RailPanel({
  title,
  backLabel,
  onBack,
  overlay,
  onCollapse,
  onSearch,
  children,
  extra,
  shelf,
}: {
  title: string;
  /** What the chevron goes back to: the workspace's name. */
  backLabel?: string;
  /** Shown while a module is open: back to the module list. */
  onBack?: () => void;
  /** Drawn over the page (720–1099px) rather than beside it. */
  overlay?: boolean;
  onCollapse?: () => void;
  onSearch?: () => void;
  children: React.ReactNode;
  /** The module's own extra section (the CRM's saved views). */
  extra?: React.ReactNode;
  /** Help and Management, at the foot. */
  shelf?: React.ReactNode;
}) {
  return (
    <div className={cn(styles.panel, overlay && styles.panelOverlay)}>
      <div className={styles.panelHead}>
        {onBack ? (
          <button
            type="button"
            aria-label={`Back to ${backLabel ?? "the modules"}`}
            className={cn(styles.iconButton, styles.back)}
            onClick={onBack}
          >
            <CaretLeft className={styles.iconButtonIcon} />
          </button>
        ) : null}
        <span className={styles.panelTitle}>{title}</span>
        {onCollapse ? (
          <button
            type="button"
            aria-label="Collapse the panel"
            aria-keyshortcuts="Meta+B Control+B"
            className={cn(styles.iconButton, styles.collapse)}
            onClick={onCollapse}
          >
            <SidebarSimple className={styles.iconButtonIcon} />
          </button>
        ) : null}
      </div>

      {onSearch ? (
        <div className={styles.panelTools}>
          <button type="button" className={styles.find} onClick={onSearch} aria-keyshortcuts="Meta+K Control+K">
            <MagnifyingGlass className={styles.findIcon} />
            <span className={styles.findLabel}>Search</span>
            <span className={styles.findHint}>⌘K</span>
          </button>
        </div>
      ) : null}

      <nav aria-label={title} className={styles.panelBody}>
        {children}
        {extra ? <div className={styles.extra}>{extra}</div> : null}
      </nav>

      {shelf ? <div className={styles.shelf}>{shelf}</div> : null}
    </div>
  );
}
