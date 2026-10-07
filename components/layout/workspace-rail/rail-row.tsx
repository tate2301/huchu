"use client";

import * as React from "react";
import Link from "next/link";

import { cn } from "@/lib/utils";
import { PushPin } from "@/lib/icons";
import type { LucideIcon } from "@/lib/icons";

import styles from "./workspace-rail.module.css";

/**
 * One panel item (00-foundations 5.3.3): 34px, a 16px icon, the label and, on
 * the right, its badge from `GET /api/v2/retail/nav/badges`. The current item
 * is solid ink (G1). Where the rail has room for pins, a pin shows on hover.
 */
export function RailRow({
  href,
  label,
  icon: Icon,
  current,
  badge,
  onNavigate,
  onPin,
  pinned,
}: {
  href: string;
  label: string;
  icon: LucideIcon;
  current?: boolean;
  badge?: string | null;
  onNavigate?: () => void;
  onPin?: () => void;
  pinned?: boolean;
}) {
  return (
    <li>
      <Link
        href={href}
        aria-current={current ? "page" : undefined}
        className={cn(styles.item, current && styles.itemCurrent)}
        onClick={onNavigate}
      >
        <Icon className={styles.itemIcon} />
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
        {badge ? <span className={styles.badge}>{badge}</span> : null}
      </Link>
    </li>
  );
}

/** A module's title over its items, in the flat panel. */
export function RailHeading({ children }: { children: React.ReactNode }) {
  return <li className={styles.heading}>{children}</li>;
}
