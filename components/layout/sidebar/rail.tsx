"use client";

import * as React from "react";
import Link from "next/link";

import type { ComposedGroup, ComposedNode } from "@/lib/nav/compose";
import type { ActiveNav } from "@/lib/nav/match";
import { arrange, type NavPrefs } from "@/lib/nav/prefs";
import { cn } from "@/lib/utils";

import { ChromeIcon, CorelithMark, NavIcon } from "./parts";
import styles from "./rail.module.css";
import sb from "./sidebar.module.css";

/**
 * The sidebar collapsed to the rail (Rail.dc.html): the switcher's mark, then
 * one mark per page, a hairline between groups, and at the foot Management and
 * the Corelith mark. Looking at a mark opens its group beside it, the mark's
 * page open on its children.
 */
export function Rail({
  groups,
  active,
  prefs,
  badges,
  switcher,
  management,
  onOpen,
}: {
  groups: ComposedGroup[];
  active: ActiveNav | null;
  prefs: NavPrefs;
  badges: Record<string, string>;
  switcher: React.ReactNode;
  management?: { href: string; current: boolean } | null;
  onOpen: () => void;
}) {
  // The rail keeps every page in its group: pins are the open sidebar's.
  const arranged = React.useMemo(() => arrange(groups, { ...prefs, pinned: [] }, active?.nodeId ?? null), [groups, prefs, active?.nodeId]);
  const [fly, setFly] = React.useState<{ group: ComposedGroup; node: string; top: number } | null>(null);
  const close = React.useRef<number | null>(null);

  const show = (group: ComposedGroup, node: ComposedNode, target: HTMLElement) => {
    if (close.current) window.clearTimeout(close.current);
    const rect = target.getBoundingClientRect();
    setFly({ group, node: node.id, top: Math.max(8, Math.min(rect.top - 6, window.innerHeight - 320)) });
  };
  const hide = () => {
    if (close.current) window.clearTimeout(close.current);
    close.current = window.setTimeout(() => setFly(null), 120);
  };

  return (
    <nav className={styles.rl} aria-label="Main" onMouseLeave={hide}>
      <div className={styles.mark}>{switcher}</div>
      <div className={styles.marks}>
        {arranged.groups.map((group) => (
          <React.Fragment key={group.id}>
            <span className={styles.sep} aria-hidden="true" />
            {group.items.map((node) => {
              const here = active?.nodeId === node.id;
              return (
                <Link
                  key={node.id}
                  href={node.href}
                  aria-label={node.label}
                  className={cn(styles.ib, here && styles.inBranch)}
                  onMouseEnter={(event) => (group.id === "top" ? setFly(null) : show(group, node, event.currentTarget))}
                  onFocus={(event) => (group.id === "top" ? setFly(null) : show(group, node, event.currentTarget))}
                >
                  <NavIcon name={node.icon} className={styles.ic} />
                </Link>
              );
            })}
          </React.Fragment>
        ))}
      </div>
      <button type="button" className={styles.ib} aria-label="Open the sidebar, [" aria-keyshortcuts="[" onClick={onOpen}>
        <ChromeIcon name="collapse" className={styles.ic} />
      </button>
      {management ? (
        <Link href={management.href} className={styles.ib} aria-label="Management" aria-current={management.current ? "page" : undefined}>
          <ChromeIcon name="management" className={styles.ic} />
        </Link>
      ) : null}
      <span className={styles.brand}>
        <CorelithMark className={styles.brandMark} />
      </span>
      {fly ? (
        <div
          className={cn(styles.fly, "cx")}
          style={{ top: fly.top }}
          role="group"
          aria-label={fly.group.label}
          onMouseEnter={() => close.current && window.clearTimeout(close.current)}
          onMouseLeave={hide}
        >
          <div className={styles.flyHead}>{fly.group.label}</div>
          {fly.group.items.map((node) => {
            const open = node.id === fly.node && node.kids.length > 0;
            const here = active?.nodeId === node.id;
            const current = here && active?.kidId === null;
            return (
              <React.Fragment key={node.id}>
                <Link
                  href={node.href}
                  className={cn(sb.it, sb.itLink, current && sb.current, open && sb.isOpen)}
                  style={{ height: 32 }}
                  aria-current={current ? "page" : undefined}
                >
                  <NavIcon name={node.icon} className={sb.ic} />
                  <span className={sb.lbl}>{node.label}</span>
                  {badges[node.href] ? <span className={sb.cnt}>{badges[node.href]}</span> : null}
                  {node.kids.length > 0 ? <ChromeIcon name="caret" className={cn(sb.ic12, sb.chev)} /> : null}
                </Link>
                {open ? (
                  <div className={sb.kids}>
                    {node.kids.map((kid) => {
                      const on = here && active?.kidId === kid.id;
                      return (
                        <Link key={kid.id} href={kid.href} className={cn(sb.kid, on && sb.current)} aria-current={on ? "page" : undefined}>
                          <NavIcon name={kid.icon} className={sb.ic14} />
                          <span className={sb.lbl}>{kid.label}</span>
                          {badges[kid.href] ? <span className={sb.cnt}>{badges[kid.href]}</span> : null}
                        </Link>
                      );
                    })}
                  </div>
                ) : null}
              </React.Fragment>
            );
          })}
        </div>
      ) : null}
    </nav>
  );
}
