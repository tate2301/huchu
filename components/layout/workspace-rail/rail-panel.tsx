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
 * An `aside` named for what it shows ("Books"), as the boards' `aside.panel-m`.
 * Its 56px head is either the workspace (the module list) or the module (or
 * folder in one) you are in, with the chevron before the title going back up
 * one level.
 * Collapsing the panel is its own button at the right of the head (and
 * Cmd/Ctrl+B). Under the head, a search narrows the panel to the items whose
 * names match, across every module; `/` focuses it. A module's rows may sit in
 * headed groups, with its Saved views and its Reports (`PanelGroup`, drawn by
 * `WorkspaceRail`). The shelf at the foot holds Help. Management is behind the rail's gear, never here.
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
  resize,
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
  /**
   * A panel wider than the module panel's 240 (Explore's, whose tabs and
   * table names need the room), resized from its right edge.
   */
  resize?: PanelResize;
}) {
  const findRef = React.useRef<HTMLInputElement>(null);
  useShortcut("/", () => findRef.current?.focus(), { enabled: Boolean(onQuery) });
  return (
    <aside
      aria-label={title}
      className={cn(styles.panel, overlay && styles.panelOverlay, resize && styles.panelSized)}
      style={resize ? ({ "--panel-w": `${resize.width}px` } as React.CSSProperties) : undefined}
    >
      {resize ? <PanelEdge title={title} {...resize} /> : null}
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
    </aside>
  );
}

export type PanelResize = {
  width: number;
  min: number;
  max: number;
  /** While dragging. */
  onResize: (width: number) => void;
  /** On letting go: keep the width as this person's. */
  onDone: () => void;
};

/**
 * The panel's right edge: drag it, or focus it and use the arrow keys (Shift
 * for bigger steps), as a builder's panels resize (`resize-edge.tsx`).
 */
function PanelEdge({ title, width, min, max, onResize, onDone }: PanelResize & { title: string }) {
  const [moving, setMoving] = React.useState(false);
  const start = React.useRef<{ at: number; width: number } | null>(null);
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={`Resize ${title}`}
      aria-valuenow={width}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      className={cn(styles.panelEdge, moving && styles.panelEdgeMoving)}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        start.current = { at: event.clientX, width };
        setMoving(true);
      }}
      onPointerMove={(event) => {
        if (start.current) onResize(start.current.width + event.clientX - start.current.at);
      }}
      onPointerUp={(event) => {
        if (!start.current) return;
        start.current = null;
        setMoving(false);
        event.currentTarget.releasePointerCapture(event.pointerId);
        onDone();
      }}
      onKeyDown={(event) => {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        event.preventDefault();
        const step = event.shiftKey ? 64 : 16;
        onResize(width + (event.key === "ArrowRight" ? step : -step));
        onDone();
      }}
    />
  );
}
