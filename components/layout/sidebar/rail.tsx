"use client";

import * as React from "react";
import Link from "next/link";

import { NAV_ICONS } from "@/lib/icons/corelith-nav.generated";
import { SidebarSimple } from "@/lib/icons";
import type { ComposedGroup } from "@/lib/nav/compose";
import type { ActiveNav } from "@/lib/nav/match";
import { arrange, type NavPrefs } from "@/lib/nav/prefs";
import { cn } from "@/lib/utils";

import styles from "./rail.module.css";

/**
 * The sidebar closed: one icon for each top-level page, in the order the
 * sidebar has them, and a flyout of a page's children from hover or focus.
 * Opening it is the one control at the top.
 */
export function Rail({
  groups,
  active,
  prefs,
  tile,
  person,
  onOpen,
}: {
  groups: ComposedGroup[];
  active: ActiveNav | null;
  prefs: NavPrefs;
  tile: React.ReactNode;
  person: React.ReactNode;
  onOpen: () => void;
}) {
  const arranged = React.useMemo(() => arrange(groups, prefs, active?.nodeId ?? null), [groups, prefs, active?.nodeId]);
  const nodes = [...arranged.pinned, ...arranged.groups.flatMap((group) => group.items)];
  return (
    <nav className={styles.rail} aria-label="Main">
      <div className={styles.tile}>{tile}</div>
      <button type="button" className={styles.open} aria-label="Open the sidebar" aria-keyshortcuts="Control+B Meta+B" onClick={onOpen}>
        <SidebarSimple width={16} height={16} aria-hidden="true" />
      </button>
      <ul className={styles.marks}>
        {nodes.map((node) => {
          const Icon = NAV_ICONS[node.icon];
          const here = active?.nodeId === node.id;
          return (
            <li key={node.id} className={styles.cell}>
              <Link href={node.href} aria-label={node.label} aria-current={here && active?.kidId === null ? "page" : undefined} className={cn(styles.mark, here && styles.current)}>
                {Icon ? <Icon width={16} height={16} aria-hidden="true" /> : null}
              </Link>
              <div className={styles.flyout} role="group" aria-label={node.label}>
                <Link href={node.href} className={cn(styles.flyTitle, here && active?.kidId === null && styles.flyCurrent)}>
                  {node.label}
                </Link>
                {node.kids.map((kid) => (
                  <Link key={kid.id} href={kid.href} className={cn(styles.flyKid, here && active?.kidId === kid.id && styles.flyCurrent)}>
                    {kid.label}
                  </Link>
                ))}
              </div>
            </li>
          );
        })}
      </ul>
      <div className={styles.person}>{person}</div>
    </nav>
  );
}
