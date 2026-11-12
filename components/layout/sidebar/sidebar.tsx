"use client";

import * as React from "react";
import Link from "next/link";

import type { ComposedGroup, ComposedNode } from "@/lib/nav/compose";
import type { ActiveNav } from "@/lib/nav/match";
import { arrange, type NavListKey, type NavPrefs, type PinnedPage } from "@/lib/nav/prefs";
import { cn } from "@/lib/utils";

import { ChromeIcon, NavIcon } from "./parts";
import styles from "./sidebar.module.css";

export type SidebarProps = {
  groups: ComposedGroup[];
  active: ActiveNav | null;
  /** The page being looked at, for a pinned record or view. */
  pathname: string;
  badges: Record<string, string>;
  prefs: NavPrefs;
  onPref: (key: NavListKey, id: string) => void;
  /** The switcher at the top. */
  switcher: React.ReactNode;
  /** The foot. */
  foot: React.ReactNode;
  /** Where the owner adds what the workspace has not bought; null for everyone else. */
  addHref?: string | null;
  /** Closes the sidebar once a destination is chosen (the phone's More). */
  onNavigate?: () => void;
  /** The shelves a module keeps for the person (the CRM's saved views), under the groups. */
  extra?: React.ReactNode;
  /** The phone's More: the whole screen, 44px rows, group names that do not fold. */
  phone?: boolean;
};

/**
 * The sidebar, one tree for the whole platform (SB-owner.dc.html): the
 * switcher, Home, the groups the workspace runs in their fixed order, Pinned,
 * More, then the foot. What is here was decided by `composeNav`; this only
 * draws it as the person arranged it.
 */
export function Sidebar({ groups, active, pathname, badges, prefs, onPref, switcher, foot, addHref, onNavigate, extra, phone = false }: SidebarProps) {
  const arranged = React.useMemo(() => arrange(groups, prefs, active?.nodeId ?? null), [groups, prefs, active?.nodeId]);
  const [moreOpen, setMoreOpen] = React.useState(false);
  const pinnedShut = !phone && prefs.folded.includes("pinned");

  const row = (node: ComposedNode) => (
    <NodeRow
      key={node.id}
      node={node}
      active={active}
      badges={badges}
      open={phone ? false : prefs.opened.includes(node.id) || active?.nodeId === node.id}
      onToggle={() => onPref("opened", node.id)}
      onNavigate={onNavigate}
      phone={phone}
    />
  );

  const head = (id: string, label: string, shut: boolean) =>
    phone ? (
      <div className={cn(styles.grpHead, styles.grpLabel)}>{label}</div>
    ) : (
      <button type="button" className={cn(styles.grpHead, shut && styles.isShut)} aria-expanded={!shut} onClick={() => onPref("folded", id)}>
        {label}
        <ChromeIcon name="caret" className={cn(styles.ic12, styles.chev)} />
      </button>
    );

  return (
    <aside className={cn(styles.sb, phone && styles.phone)} aria-label="Main">
      {switcher}
      <div className={styles.scroll}>
        <nav className={styles.tree} aria-label="Workspace">
          {arranged.groups.map((group) => {
            if (group.id === "top") {
              if (phone) return null;
              return (
                <div key={group.id} className={styles.grp}>
                  {group.items.map(row)}
                </div>
              );
            }
            const shut = !phone && prefs.folded.includes(group.id) && !group.items.some((node) => node.id === active?.nodeId);
            return (
              <div key={group.id} className={styles.grp}>
                {head(group.id, group.label, shut)}
                {shut ? null : group.items.map(row)}
              </div>
            );
          })}
          {arranged.pinned.length + arranged.pages.length > 0 ? (
            <div className={styles.grp}>
              {head("pinned", "Pinned", pinnedShut)}
              {pinnedShut ? null : (
                <>
                  {arranged.pinned.map(row)}
                  {arranged.pages.map((page) => (
                    <PageRow key={page.href} page={page} current={page.href === pathname} onNavigate={onNavigate} />
                  ))}
                </>
              )}
            </div>
          ) : null}
          {arranged.more.length > 0 ? (
            <div className={styles.grp}>
              <div className={cn(styles.it, styles.hasChev, moreOpen && styles.isOpen)}>
                <button type="button" className={styles.itLink} aria-expanded={moreOpen} onClick={() => setMoreOpen((open) => !open)}>
                  <ChromeIcon name="more" className={styles.ic} />
                  <span className={styles.lbl}>More</span>
                  <span className={styles.cnt}>{arranged.more.length}</span>
                </button>
                <span className={styles.chevBtn} aria-hidden="true">
                  <ChromeIcon name="caret" className={cn(styles.ic12, styles.chev)} />
                </span>
              </div>
              {moreOpen ? arranged.more.map(row) : null}
            </div>
          ) : null}
          {addHref ? (
            <div className={styles.grp}>
              <Link href={addHref} className={styles.add} onClick={onNavigate}>
                <ChromeIcon name="add" className={styles.ic} />
                <span>Add Books, People and more</span>
              </Link>
            </div>
          ) : null}
          {extra}
        </nav>
      </div>
      {foot}
    </aside>
  );
}

function NodeRow({
  node,
  active,
  badges,
  open,
  onToggle,
  onNavigate,
  phone,
}: {
  node: ComposedNode;
  active: ActiveNav | null;
  badges: Record<string, string>;
  open: boolean;
  onToggle: () => void;
  onNavigate?: () => void;
  phone: boolean;
}) {
  const here = active?.nodeId === node.id;
  const current = here && active?.kidId === null;
  const kids = node.kids.length > 0;
  const branch = here && !current;
  const count = levelCount(node, badges) ?? badges[node.href];
  return (
    <>
      <div className={cn(styles.it, kids && styles.hasChev, current && styles.current, branch && styles.inBranch, kids && open && styles.isOpen)}>
        <Link href={node.href} className={styles.itLink} aria-current={current ? "page" : undefined} onClick={onNavigate}>
          <NavIcon name={node.icon} className={styles.ic} />
          <span className={styles.lbl}>{node.label}</span>
          {count ? <span className={styles.cnt}>{count}</span> : null}
        </Link>
        {kids ? (
          phone ? (
            <span className={styles.chevBtn} aria-hidden="true">
              <ChromeIcon name="caret" className={cn(styles.ic12, styles.chev)} />
            </span>
          ) : (
            <button type="button" className={styles.chevBtn} aria-expanded={open} aria-label={`${node.label}, ${open ? "close" : "open"}`} onClick={onToggle}>
              <ChromeIcon name="caret" className={cn(styles.ic12, styles.chev)} />
            </button>
          )
        ) : null}
      </div>
      {kids && open ? (
        <div className={styles.kids}>
          {node.kids.map((kid) => {
            const on = here && active?.kidId === kid.id;
            return (
              <Link key={kid.id} href={kid.href} className={cn(styles.kid, on && styles.current)} aria-current={on ? "page" : undefined} onClick={onNavigate}>
                <NavIcon name={kid.icon} className={styles.ic14} />
                <span className={styles.lbl}>{kid.label}</span>
                {badges[kid.href] ? <span className={styles.cnt}>{badges[kid.href]}</span> : null}
              </Link>
            );
          })}
        </div>
      ) : null}
    </>
  );
}

/** A record or a view the person pinned. */
function PageRow({ page, current, onNavigate }: { page: PinnedPage; current: boolean; onNavigate?: () => void }) {
  return (
    <div className={cn(styles.it, current && styles.current)}>
      <Link href={page.href} className={styles.itLink} aria-current={current ? "page" : undefined} onClick={onNavigate}>
        <NavIcon name={page.icon ?? "bookmark"} className={styles.ic} />
        <span className={styles.lbl}>{page.label}</span>
      </Link>
    </div>
  );
}

/** What waits in a level: the counts of its open rows, summed (Books' levels). */
function levelCount(node: ComposedNode, badges: Record<string, string>): string | null {
  if (node.group !== "books" || node.kids.length === 0) return null;
  const total = node.kids.reduce((sum, kid) => sum + (Number(badges[kid.href] ?? 0) || 0), 0);
  return total > 0 ? String(total) : null;
}
