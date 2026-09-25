"use client";

import * as React from "react";
import Link from "next/link";

import { cn } from "@/lib/utils";
import { PushPin } from "@/lib/icons";
import type { LucideIcon } from "@/lib/icons";

import styles from "./workspace-rail.module.css";

export type RailCount =
  | { kind: "count"; value: number }
  | { kind: "badge"; value: string; urgent?: boolean }
  | undefined;

/**
 * A destination.
 *
 * A figure is drawn only where the number changes what you would do next: a
 * plain grey count for how many there are, a red pill for how many are waiting
 * on you, and nothing at all everywhere else. A count on every row is a count
 * on none.
 */
export function RailRow({
  href,
  label,
  icon: Icon,
  active,
  dim,
  trailing,
  onPin,
  pinned,
  pinLabel,
}: {
  href: string;
  label: string;
  icon: LucideIcon;
  active?: boolean;
  dim?: boolean;
  trailing?: RailCount;
  onPin?: () => void;
  pinned?: boolean;
  pinLabel?: string;
}) {
  return (
    <li>
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        className={cn(
          styles.row,
          active && styles.rowActive,
          dim && styles.rowDim,
        )}
      >
        <Icon className={styles.rowIcon} width={16} height={16} />
        <span className={styles.rowLabel}>{label}</span>
        {onPin ? (
          <button
            type="button"
            aria-label={
              pinned ? `Unpin ${pinLabel ?? label}` : `Pin ${pinLabel ?? label}`
            }
            aria-pressed={pinned}
            className={cn(styles.pinButton, pinned && styles.pinButtonOn)}
            onClick={(event) => {
              // The row is a link; the pin is not a way of following it.
              event.preventDefault();
              event.stopPropagation();
              onPin();
            }}
          >
            <PushPin width={13} height={13} />
          </button>
        ) : null}
        <RailTrailing trailing={trailing} />
      </Link>
    </li>
  );
}

function RailTrailing({ trailing }: { trailing: RailCount }) {
  if (!trailing) return null;
  if (trailing.kind === "count") {
    return <span className={styles.count}>{trailing.value}</span>;
  }
  return (
    <span
      className={cn(styles.badge, trailing.urgent && styles.badgeUrgent)}
    >
      {trailing.value}
    </span>
  );
}

export function RailRows({ children }: { children: React.ReactNode }) {
  return <ul className={styles.rows}>{children}</ul>;
}

export function RailHeading({ children }: { children: React.ReactNode }) {
  return <div className={styles.heading}>{children}</div>;
}
