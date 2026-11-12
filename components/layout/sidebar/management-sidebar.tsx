"use client";

import * as React from "react";
import Link from "next/link";

import type { ManagementGroup } from "@/lib/nav/management";
import type { NavListKey, NavPrefs } from "@/lib/nav/prefs";
import { cn } from "@/lib/utils";

import { ChromeIcon, NavIcon } from "./parts";
import styles from "./sidebar.module.css";

const ALL_PREFIX = "mgmt:";

/**
 * Management, in the sidebar's place (MG-owner.dc.html): the switcher, one row
 * back to the workspace, Find in Management, then every group this person may
 * set up. Groups fold as the main sidebar's do; on the phone they do not.
 */
export function ManagementSidebar({
  groups,
  active,
  backHref,
  workspaceName,
  prefs,
  onPref,
  counts,
  switcher,
  foot,
  onNavigate,
  phone = false,
}: {
  groups: ManagementGroup[];
  active: string | null;
  backHref: string;
  workspaceName: string;
  prefs: NavPrefs;
  onPref: (key: NavListKey, id: string) => void;
  counts?: Record<string, string>;
  switcher: React.ReactNode;
  foot: React.ReactNode;
  onNavigate?: () => void;
  phone?: boolean;
}) {
  const [query, setQuery] = React.useState("");
  const find = React.useRef<HTMLInputElement>(null);

  // "/" finds in Management from anywhere but a field.
  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey || event.defaultPrevented) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable=''], [contenteditable='true'], [role='dialog']")) return;
      event.preventDefault();
      find.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const wanted = query.trim().toLowerCase();
  const shown = wanted
    ? groups
        .map((group) => ({
          ...group,
          items: group.items.filter((item) => item.label.toLowerCase().includes(wanted) || group.label.toLowerCase().includes(wanted)),
        }))
        .filter((group) => group.items.length > 0)
    : groups;

  return (
    <aside className={cn(styles.sb, phone && styles.phone)} aria-label="Management">
      {switcher}
      <Link href={backHref} className={styles.back} onClick={onNavigate}>
        <ChromeIcon name="back" className={styles.ic14} />
        Back to {workspaceName}
      </Link>
      <label className={styles.find}>
        <ChromeIcon name="search" className={styles.ic14} />
        <input
          ref={find}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setQuery("");
              event.currentTarget.blur();
            }
          }}
          placeholder="Find in Management"
          aria-label="Find in Management"
        />
        <span className={styles.kbd}>/</span>
      </label>
      <div className={styles.scroll} style={{ paddingTop: 0 }}>
        <nav className={styles.tree} aria-label="Management">
          {shown.map((group) => {
            const shut = !phone && !wanted && prefs.folded.includes(ALL_PREFIX + group.id) && !group.items.some((item) => item.id === active);
            return (
              <div key={group.id} className={styles.grp}>
                {phone ? (
                  <div className={cn(styles.grpHead, styles.grpLabel)}>{group.label}</div>
                ) : (
                  <button
                    type="button"
                    className={cn(styles.grpHead, shut && styles.isShut)}
                    aria-expanded={!shut}
                    onClick={() => onPref("folded", ALL_PREFIX + group.id)}
                  >
                    {group.label}
                    <ChromeIcon name="caret" className={cn(styles.ic12, styles.chev)} />
                  </button>
                )}
                {shut
                  ? null
                  : group.items.map((item) => {
                      const current = item.id === active;
                      return (
                        <div key={item.id} className={cn(styles.it, current && styles.current)}>
                          <Link href={item.href} className={styles.itLink} aria-current={current ? "page" : undefined} onClick={onNavigate}>
                            <NavIcon name={item.icon} className={styles.ic} />
                            <span className={styles.lbl}>{item.label}</span>
                            {counts?.[item.id] ? <span className={styles.cnt}>{counts[item.id]}</span> : null}
                          </Link>
                        </div>
                      );
                    })}
              </div>
            );
          })}
          {shown.length === 0 ? <div className={styles.empty}>Nothing called “{query.trim()}”</div> : null}
        </nav>
      </div>
      {foot}
    </aside>
  );
}
