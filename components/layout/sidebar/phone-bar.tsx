"use client";

import * as React from "react";
import Link from "next/link";

import { NAV_ICONS } from "@/lib/icons/corelith-nav.generated";
import type { ComposedGroup } from "@/lib/nav/compose";
import type { ActiveNav } from "@/lib/nav/match";
import { arrange, type NavPrefs } from "@/lib/nav/prefs";
import { cn } from "@/lib/utils";

import { ChromeIcon } from "./parts";
import styles from "./phone-bar.module.css";

/** How many destinations the bar holds before More. */
export const PHONE_DESTINATIONS = 4;

/**
 * The phone's bottom bar: four destinations and More, which opens the same
 * tree as the sidebar does (the drawer). The destinations are the person's
 * pinned pages, then the first pages of the sidebar.
 */
export function PhoneBar({
  groups,
  active,
  prefs,
  badges = {},
  moreOpen = false,
  onMore,
}: {
  groups: ComposedGroup[];
  active: ActiveNav | null;
  prefs: NavPrefs;
  badges?: Record<string, string>;
  moreOpen?: boolean;
  onMore: () => void;
}) {
  const arranged = React.useMemo(() => arrange(groups, prefs, active?.nodeId ?? null), [groups, prefs, active?.nodeId]);
  const nodes = [...arranged.pinned, ...arranged.groups.flatMap((group) => group.items)].slice(0, PHONE_DESTINATIONS);
  const inBar = nodes.some((node) => node.id === active?.nodeId);
  return (
    <nav className={styles.bar} aria-label="Main" data-phone-bar="">
      {nodes.map((node) => {
        const Icon = NAV_ICONS[node.icon];
        const here = !moreOpen && node.id === active?.nodeId;
        const waiting = Boolean(badges[node.href]) || node.kids.some((kid) => Boolean(badges[kid.href]));
        return (
          <Link key={node.id} href={node.href} className={cn(styles.tab, here && styles.current)} aria-current={here ? "page" : undefined}>
            {Icon ? <Icon width={20} height={20} aria-hidden="true" /> : null}
            <span className={styles.name}>{node.label}</span>
            {waiting ? <span className={styles.dot} aria-hidden="true" /> : null}
          </Link>
        );
      })}
      <button
        type="button"
        className={cn(styles.tab, (moreOpen || (!inBar && active)) && styles.current)}
        aria-expanded={moreOpen}
        onClick={onMore}
      >
        <ChromeIcon name="more" />
        <span className={styles.name}>More</span>
      </button>
    </nav>
  );
}
