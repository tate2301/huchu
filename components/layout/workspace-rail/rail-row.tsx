"use client";

import * as React from "react";
import Link from "next/link";

import { cn } from "@/lib/utils";
import { BOOKS_ROW_ICON } from "@/components/books/icons/books-nav-icons";
import { CaretRight, PushPin } from "@/lib/icons";

const LockIcon = BOOKS_ROW_ICON.Lock;
import type { LucideIcon } from "@/lib/icons";

import styles from "./workspace-rail.module.css";

/**
 * One panel item (00-foundations 5.3.3): 36px, a 16px icon (or a saved view's
 * square), the label and, on the right, its count (the shell's badges) or a
 * word ("shared", "you"). The current item is a fill with ink. Where the rail
 * has room for pins, a pin shows on hover.
 */
export function RailRow({
  href,
  label,
  icon: Icon,
  current,
  badge,
  meta,
  onNavigate,
  onPin,
  pinned,
  after,
  lock,
}: {
  href: string;
  label: string;
  /** No icon: the row is marked with a small square, as a saved view is. */
  icon?: LucideIcon;
  current?: boolean;
  badge?: string | null;
  /** A word where a count would sit: "shared", "you". */
  meta?: string;
  onNavigate?: () => void;
  onPin?: () => void;
  pinned?: boolean;
  /** Drawn over the row's right edge, outside the link: its own menu. */
  after?: React.ReactNode;
  /** The plan's price where the workspace does not have it, with a lock (`NavItem.lock`). */
  lock?: string;
}) {
  return (
    <li className={after ? styles.rowWrap : undefined}>
      <Link
        href={href}
        aria-current={current ? "page" : undefined}
        className={cn(styles.item, current && styles.itemCurrent)}
        onClick={onNavigate}
      >
        {Icon ? <Icon className={styles.itemIcon} data-current={current || undefined} /> : <span className={styles.dot} aria-hidden="true" />}
        <span className={styles.itemLabel}>{label}</span>
        {onPin ? (
          <button
            type="button"
            aria-label={pinned ? `Unpin ${label}` : `Pin ${label}`}
            aria-pressed={pinned}
            className={cn(styles.pin, pinned && styles.pinOn)}
            onClick={(event) => {
              // The row is a link; the pin is not a way of following it.
              event.preventDefault();
              event.stopPropagation();
              onPin();
            }}
          >
            <PushPin className={styles.pinIcon} weight={pinned ? "fill" : "regular"} />
          </button>
        ) : null}
        {lock ? (
          <>
            <span className={styles.meta}>{lock}</span>
            <LockIcon className={styles.levelCaret} aria-label="Not on your plan" />
          </>
        ) : badge ? (
          <span className={styles.badge}>{badge}</span>
        ) : null}
        {meta ? <span className={styles.meta}>{meta}</span> : null}
      </Link>
      {after}
    </li>
  );
}

/**
 * A row with children (a CRM's Pipeline, a store's Stock): pressing it opens
 * its level of the panel, with a back chevron at the head; it never unfolds
 * in place. A button, not a link: it goes down a level, not to a page.
 */
export function LevelRow({
  label,
  icon: Icon,
  holdsPage,
  badge,
  onOpen,
}: {
  label: string;
  icon: LucideIcon;
  /** The things waiting in the level: its rows' counts, summed (Books' bk-nav). */
  badge?: string | null;
  /** The page being looked at is somewhere in this level. */
  holdsPage?: boolean;
  onOpen: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        className={cn(styles.item, styles.levelRow, holdsPage && styles.itemCurrent)}
        aria-current={holdsPage ? "true" : undefined}
        onClick={onOpen}
      >
        <Icon className={styles.itemIcon} data-current={holdsPage || undefined} />
        <span className={styles.itemLabel}>{label}</span>
        {badge ? <span className={styles.badge}>{badge}</span> : null}
        <CaretRight className={styles.levelCaret} aria-hidden="true" />
      </button>
    </li>
  );
}

/** A module's title over its items, in the flat panel. */
export function RailHeading({ children }: { children: React.ReactNode }) {
  return <li className={styles.heading}>{children}</li>;
}
