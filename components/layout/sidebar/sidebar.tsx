"use client";

import * as React from "react";
import Link from "next/link";

import { VaneMark } from "@/components/core/vane-mark";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/workspace/menu";
import { NAV_ICONS, type CorelithIcon } from "@/lib/icons/corelith-nav.generated";
import { CaretRight, DotsThree, GearSix, SidebarSimple } from "@/lib/icons";
import type { ComposedGroup, ComposedNode } from "@/lib/nav/compose";
import type { ActiveNav } from "@/lib/nav/match";
import { arrange, type NavPrefs } from "@/lib/nav/prefs";
import { cn } from "@/lib/utils";

import styles from "./sidebar.module.css";

type Vane = { open: boolean; count: number; working: boolean; onToggle: () => void };

export type SidebarProps = {
  groups: ComposedGroup[];
  active: ActiveNav | null;
  badges: Record<string, string>;
  prefs: NavPrefs;
  onPref: (key: keyof NavPrefs, id: string) => void;
  /** The workspace tile, with its account menu. */
  tile: React.ReactNode;
  /** The person at the foot, with their menu. */
  person: React.ReactNode;
  management?: { href: string; label: string } | null;
  vane?: Vane | null;
  /** Closes the sidebar once a destination is chosen (the phone drawer). */
  onNavigate?: () => void;
  /** The shelves a module keeps for the person (the CRM's saved views), under the groups. */
  extra?: React.ReactNode;
  /** Closes the sidebar beside the page. */
  onCollapse?: () => void;
  /** Fills its container (the phone drawer) instead of its own width. */
  fill?: boolean;
};

function Glyph({ name }: { name: string }) {
  const Icon: CorelithIcon | undefined = NAV_ICONS[name];
  return Icon ? <Icon className={styles.icon} aria-hidden="true" width={16} height={16} /> : <span className={styles.icon} />;
}

/**
 * The sidebar, one column for the whole platform: Pinned, then the groups the
 * person's workspace runs, then More. What is here was decided by
 * `composeNav`; this only draws it and keeps the person's arrangement.
 */
export function Sidebar({ groups, active, badges, prefs, onPref, tile, person, management, vane, onNavigate, extra, onCollapse, fill }: SidebarProps) {
  const arranged = React.useMemo(() => arrange(groups, prefs, active?.nodeId ?? null), [groups, prefs, active?.nodeId]);
  const [moreOpen, setMoreOpen] = React.useState(false);

  const row = (node: ComposedNode, where: "pinned" | "group" | "more") => (
    <NodeRow
      key={node.id}
      node={node}
      where={where}
      active={active}
      badge={levelCount(node, badges) ?? badges[node.href]}
      badges={badges}
      open={prefs.opened.includes(node.id) || active?.nodeId === node.id}
      pinned={prefs.pinned.includes(node.id)}
      onPref={onPref}
      onNavigate={onNavigate}
    />
  );

  return (
    <nav className={cn(styles.sidebar, fill && styles.fill)} aria-label="Main">
      <div className={styles.head}>
        {tile}
        {onCollapse ? (
          <button type="button" className={styles.collapse} aria-label="Close the sidebar" aria-keyshortcuts="Control+B Meta+B" onClick={onCollapse}>
            <SidebarSimple width={16} height={16} aria-hidden="true" />
          </button>
        ) : null}
      </div>
      <div className={styles.scroll}>
        {arranged.pinned.length > 0 ? (
          <section className={styles.group} aria-label="Pinned">
            <h2 className={styles.label}>Pinned</h2>
            <ul className={styles.list}>{arranged.pinned.map((node) => row(node, "pinned"))}</ul>
          </section>
        ) : null}
        {arranged.groups.map((group) => {
          const folded = prefs.folded.includes(group.id) && !group.items.some((node) => node.id === active?.nodeId);
          return (
            <section key={group.id} className={styles.group} aria-label={group.label}>
              {group.id === "top" ? null : (
                <button
                  type="button"
                  className={styles.labelButton}
                  aria-expanded={!folded}
                  onClick={() => onPref("folded", group.id)}
                >
                  <span>{group.label}</span>
                  <CaretRight className={cn(styles.caret, !folded && styles.caretOpen)} width={12} height={12} aria-hidden="true" />
                </button>
              )}
              {folded ? null : <ul className={styles.list}>{group.items.map((node) => row(node, "group"))}</ul>}
            </section>
          );
        })}
        {arranged.more.length > 0 ? (
          <section className={styles.group} aria-label="More">
            <button type="button" className={styles.labelButton} aria-expanded={moreOpen} onClick={() => setMoreOpen((open) => !open)}>
              <span>More</span>
              <CaretRight className={cn(styles.caret, moreOpen && styles.caretOpen)} width={12} height={12} aria-hidden="true" />
            </button>
            {moreOpen ? <ul className={styles.list}>{arranged.more.map((node) => row(node, "more"))}</ul> : null}
          </section>
        ) : null}
        {extra}
      </div>
      <div className={styles.foot}>
        {vane ? (
          <button
            type="button"
            className={cn(styles.footRow, vane.open && styles.current)}
            aria-pressed={vane.open}
            aria-keyshortcuts="Control+J Meta+J"
            onClick={vane.onToggle}
          >
            <span className={styles.icon}>
              <VaneMark size={16} />
            </span>
            <span className={styles.text}>Vane</span>
            {vane.count > 0 ? <span className={styles.badge}>{vane.count > 99 ? "99+" : vane.count}</span> : null}
            {vane.working ? <span aria-hidden="true" className={styles.live} /> : null}
          </button>
        ) : null}
        {management ? (
          <Link href={management.href} className={styles.footRow} onClick={onNavigate}>
            <GearSix className={styles.icon} width={16} height={16} aria-hidden="true" />
            <span className={styles.text}>{management.label}</span>
          </Link>
        ) : null}
        <div className={styles.person}>{person}</div>
      </div>
    </nav>
  );
}

function NodeRow({
  node,
  where,
  active,
  badge,
  badges,
  open,
  pinned,
  onPref,
  onNavigate,
}: {
  node: ComposedNode;
  where: "pinned" | "group" | "more";
  active: ActiveNav | null;
  badge?: string;
  badges: Record<string, string>;
  open: boolean;
  pinned: boolean;
  onPref: (key: keyof NavPrefs, id: string) => void;
  onNavigate?: () => void;
}) {
  const here = active?.nodeId === node.id;
  const current = here && active?.kidId === null;
  const hasKids = node.kids.length > 0;
  return (
    <li className={styles.item}>
      <div className={cn(styles.row, current && styles.current)}>
        <Link href={node.href} className={styles.link} aria-current={current ? "page" : undefined} onClick={onNavigate}>
          <Glyph name={node.icon} />
          <span className={styles.text}>{node.label}</span>
          {node.lock ? <Locked price={node.lock} /> : badge ? <span className={styles.badge}>{badge}</span> : null}
        </Link>
        {hasKids ? (
          <button
            type="button"
            className={styles.toggle}
            aria-expanded={open}
            aria-label={`${node.label}, ${open ? "close" : "open"}`}
            onClick={() => onPref("opened", node.id)}
          >
            <CaretRight className={cn(styles.caret, open && styles.caretOpen)} width={12} height={12} aria-hidden="true" />
          </button>
        ) : null}
        <Menu>
          <MenuTrigger asChild>
            <button type="button" className={styles.more} aria-label={`${node.label}, arrange`}>
              <DotsThree width={16} height={16} aria-hidden="true" />
            </button>
          </MenuTrigger>
          <MenuContent side="right" align="start">
            <MenuItem onSelect={() => onPref("pinned", node.id)}>{pinned ? "Unpin" : "Pin"}</MenuItem>
            {where === "more" ? (
              <MenuItem onSelect={() => onPref("hidden", node.id)}>Move back</MenuItem>
            ) : (
              <MenuItem onSelect={() => onPref("hidden", node.id)}>Move to More</MenuItem>
            )}
          </MenuContent>
        </Menu>
      </div>
      {hasKids && open ? (
        <ul className={styles.kids}>
          {node.kids.map((kid) => (
            <li key={kid.id}>
              <Link
                href={kid.href}
                className={cn(styles.kid, here && active?.kidId === kid.id && styles.current)}
                aria-current={here && active?.kidId === kid.id ? "page" : undefined}
                onClick={onNavigate}
              >
                <span className={styles.text}>{kid.label}</span>
                {kid.lock ? <Locked price={kid.lock} /> : badges[kid.href] ? <span className={styles.badge}>{badges[kid.href]}</span> : null}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}

/** A page the plan does not include: its price and a lock. It still opens, onto what the plan adds. */
function Locked({ price }: { price: string }) {
  const Lock = NAV_ICONS.lock;
  return (
    <span className={styles.badge}>
      {price}
      {Lock ? <Lock width={12} height={12} aria-label="Not on your plan" /> : null}
    </span>
  );
}

/** What waits in a level: the counts of its open rows, summed (Books' levels). */
function levelCount(node: ComposedNode, badges: Record<string, string>): string | null {
  if (node.group !== "books" || node.kids.length === 0) return null;
  const total = node.kids.reduce((sum, kid) => sum + (kid.lock ? 0 : Number(badges[kid.href] ?? 0) || 0), 0);
  return total > 0 ? String(total) : null;
}
