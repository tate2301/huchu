"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import { CaretLeft, MagnifyingGlass, SidebarSimple } from "@/lib/icons";
import { useShortcut } from "@/components/core/shortcuts";

import styles from "./workspace-rail.module.css";

/**
 * The panel beside the rail (design/core-modules/spec/shell.md): 240px on the
 * surface.
 *
 * Its 56px head is either the workspace (the module list) or the module (or
 * folder in one) you are in, with the chevron before the title going back up
 * one level.
 * Collapsing the panel is its own button at the right of the head (and
 * Cmd/Ctrl+B). Under the head, a search narrows the panel to the items whose
 * names match, across every module; `/` focuses it. The shelf at the foot
 * holds Help. Management is behind the rail's gear, never here.
 */
export function RailPanel({
  title,
  backLabel,
  onBack,
  overlay,
  onCollapse,
  query,
  onQuery,
  children,
  extra,
  shelf,
}: {
  title: string;
  /** What the chevron goes back to: the workspace's name, or the module a folder sits in. */
  backLabel?: string;
  /** Shown while a module or a folder is open: back up one level. */
  onBack?: () => void;
  /** Drawn over the page (720–1099px) rather than beside it. */
  overlay?: boolean;
  onCollapse?: () => void;
  /** What is typed in the panel's search; the rows are narrowed by the caller. */
  query?: string;
  onQuery?: (query: string) => void;
  children: React.ReactNode;
  /** The module's own extra section (the CRM's saved views). */
  extra?: React.ReactNode;
  /** Help and Management, at the foot. */
  shelf?: React.ReactNode;
}) {
  const findRef = React.useRef<HTMLInputElement>(null);
  useShortcut("/", () => findRef.current?.focus(), { enabled: Boolean(onQuery) });
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
            aria-label="Hide the panel"
            aria-keyshortcuts="Meta+B Control+B"
            className={cn(styles.iconButton, styles.collapse)}
            onClick={onCollapse}
          >
            <SidebarSimple className={styles.iconButtonIcon} />
          </button>
        ) : null}
      </div>

      {onQuery ? (
        <div className={styles.panelTools}>
          <label className={styles.find}>
            <MagnifyingGlass className={styles.findIcon} />
            <input
              ref={findRef}
              type="search"
              className={styles.findInput}
              placeholder="Search"
              aria-label={`Search ${title}`}
              aria-keyshortcuts="/"
              value={query ?? ""}
              onChange={(event) => onQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape" && query) {
                  event.preventDefault();
                  onQuery("");
                }
              }}
            />
            <span className={styles.findHint}>/</span>
          </label>
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
