"use client";

import * as React from "react";
import Link from "next/link";

import { cn } from "@/lib/utils";
import type { LucideIcon } from "@/lib/icons";

import styles from "./workspace-rail.module.css";

/**
 * One panel item (00-foundations 5.3.3): 34px, a 16px icon, the label and, on
 * the right, its badge from `GET /api/v2/retail/nav/badges`. The current item
 * is solid ink (G1).
 */
export function RailRow({
  href,
  label,
  icon: Icon,
  current,
  badge,
  onNavigate,
}: {
  href: string;
  label: string;
  icon: LucideIcon;
  current?: boolean;
  badge?: string | null;
  onNavigate?: () => void;
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
        {badge ? <span className={styles.badge}>{badge}</span> : null}
      </Link>
    </li>
  );
}
