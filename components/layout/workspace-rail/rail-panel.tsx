"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import {
  CaretLeft,
  MagnifyingGlass,
  MedusaCirclePlusIcon,
  SidebarSimple,
} from "@/lib/icons";

import styles from "./workspace-rail.module.css";

/**
 * Tier two.
 *
 * Its header is either the workspace (the map) or the area you are in, with a
 * way back to the map. Search and New sit under it in both, because both are
 * about the whole workspace rather than this area.
 */
export function RailPanel({
  title,
  backLabel,
  onBack,
  onCollapse,
  onSearch,
  onNew,
  newLabel,
  children,
  shelf,
}: {
  title: string;
  backLabel?: string;
  onBack?: () => void;
  onCollapse?: () => void;
  onSearch?: () => void;
  onNew?: () => void;
  newLabel?: string;
  children: React.ReactNode;
  shelf?: React.ReactNode;
}) {
  return (
    <div className={styles.panel}>
      <div className={cn(styles.panelHead, onBack && styles.panelHeadBack)}>
        {onBack ? (
          <button
            type="button"
            aria-label={`Back to ${backLabel ?? "the workspace"}`}
            className={styles.iconButton}
            onClick={onBack}
          >
            <CaretLeft width={15} height={15} />
          </button>
        ) : null}
        <span className={styles.panelTitle}>{title}</span>
        {onCollapse ? (
          <button
            type="button"
            aria-label="Collapse the rail"
            className={styles.iconButton}
            onClick={onCollapse}
          >
            <SidebarSimple width={15} height={15} />
          </button>
        ) : null}
      </div>

      <div className={styles.panelTools}>
        <button type="button" className={styles.find} onClick={onSearch}>
          <MagnifyingGlass width={15} height={15} />
          <span className={styles.findLabel}>Search</span>
          <span className={styles.count}>⌘K</span>
        </button>
        {onNew ? (
          <button type="button" className={styles.new} onClick={onNew}>
            <MedusaCirclePlusIcon width={15} height={15} />
            {newLabel ?? "New"}
          </button>
        ) : null}
      </div>

      <nav className={styles.panelBody} aria-label={title}>
        {children}
      </nav>

      {shelf ? <div className={styles.shelf}>{shelf}</div> : null}
    </div>
  );
}
