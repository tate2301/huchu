"use client";

import * as React from "react";
import Link from "next/link";

import { ChevronDown } from "@/lib/icons";
import type { LucideIcon } from "@/lib/icons";
import { cn } from "@/lib/utils";

import styles from "./panel.module.css";

/** A module's own column beside the sidebar (Vane's pages): a list of rows. */
export function Panel({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <nav aria-label={label} className={styles.panel}>
      <ul className={styles.list}>{children}</ul>
    </nav>
  );
}

/** One row: an icon, the label and, on the right, its count. */
export function PanelRow({
  href,
  label,
  icon: Icon,
  current,
  badge,
}: {
  href: string;
  label: string;
  icon: LucideIcon;
  current?: boolean;
  badge?: string | null;
}) {
  return (
    <li>
      <Link href={href} aria-current={current ? "page" : undefined} className={cn(styles.row, current && styles.current)}>
        <Icon className={styles.icon} />
        <span className={styles.text}>{label}</span>
        {badge ? <span className={styles.badge}>{badge}</span> : null}
      </Link>
    </li>
  );
}

/** A folding band of rows under a label; a band that holds the page always opens. */
export function PanelGroup({
  label,
  defaultOpen = true,
  holdsCurrent = false,
  children,
}: {
  label: string;
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
    <li className={styles.group}>
      <h2 className={styles.groupHead}>
        <button type="button" className={styles.groupToggle} aria-expanded={open} aria-controls={rowsId} onClick={() => setOpen((value) => !value)}>
          <ChevronDown className={cn(styles.chevron, !open && styles.chevronClosed)} aria-hidden="true" />
          <span>{label}</span>
        </button>
      </h2>
      <ul id={rowsId} className={styles.list} hidden={!open}>
        {children}
      </ul>
    </li>
  );
}
