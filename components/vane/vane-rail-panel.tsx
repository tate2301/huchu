"use client";

import * as React from "react";
import { usePathname, useSearchParams } from "next/navigation";

import { Icon, type IconName } from "@/components/core";
import { PanelGroup } from "@/components/layout/workspace-rail/panel-group";
import { RailPanel } from "@/components/layout/workspace-rail/rail-panel";
import { RailRow } from "@/components/layout/workspace-rail/rail-row";
import styles from "@/components/layout/workspace-rail/workspace-rail.module.css";
import type { LucideIcon } from "@/lib/icons";

import { useVaneNav } from "./use-vane";

const icons = new Map<IconName, LucideIcon>();

/** A kit glyph where the rail's rows take an icon component. */
function kitIcon(name: IconName): LucideIcon {
  let icon = icons.get(name);
  if (!icon) {
    icon = function KitIcon({ className }: { className?: string }) {
      return <Icon name={name} className={className} />;
    } as LucideIcon;
    icons.set(name, icon);
  }
  return icon;
}

/** The kit glyph for a module Vane watches. */
const WATCH_ICON: Record<string, IconName> = {
  books: "books",
  crm: "pipeline",
  retail: "showroom",
  schools: "users",
  gold: "grade",
  people: "person",
  reports: "reports",
};

type Row = { href: string; label: string; icon: IconName; badge?: string | null };

/** Where the page is in Vane's panel: the row whose address it is. */
export function vaneRowFor(pathname: string, params: URLSearchParams): string {
  if (pathname === "/vane") {
    const sourceModule = params.get("module");
    if (sourceModule) return `/vane?module=${sourceModule}`;
    if (params.get("view") === "working") return "/vane?view=working";
    return "/vane";
  }
  return pathname;
}

/**
 * Vane's own panel (VaneForYou): For you, Working on, Plans, Done and Muted,
 * each with its count, then Watching, the modules Management → Vane has it
 * watch. Drawn in place of a module's panel while the page is one of Vane's.
 */
export function VaneRailPanel({
  overlay,
  onCollapse,
  onNavigate,
  shelf,
}: {
  overlay?: boolean;
  onCollapse?: () => void;
  onNavigate?: () => void;
  shelf?: React.ReactNode;
}) {
  const pathname = usePathname();
  const params = useSearchParams();
  const current = vaneRowFor(pathname, new URLSearchParams(params.toString()));
  const { data } = useVaneNav();
  const [query, setQuery] = React.useState("");
  const needle = query.trim().toLowerCase();

  const counts = data?.counts;
  const count = (n: number | undefined) => (n ? String(n) : null);
  const rows: Row[] = [
    { href: "/vane", label: "For you", icon: "foryou", badge: count(counts?.forYou) },
    { href: "/vane?view=working", label: "Working on", icon: "working", badge: count(counts?.working) },
    { href: "/vane/plans", label: "Plans", icon: "step", badge: count(counts?.plans) },
    { href: "/vane/done", label: "Done", icon: "done", badge: counts ? `${counts.doneToday} today` : null },
    { href: "/vane/muted", label: "Muted", icon: "muted", badge: count(counts?.muted) },
  ];
  const watching: Row[] = (data?.watching ?? []).map((watch) => ({
    href: `/vane?module=${watch.key}`,
    label: watch.name,
    icon: WATCH_ICON[watch.key] ?? "list",
  }));
  const shown = (row: Row) => !needle || row.label.toLowerCase().includes(needle);
  const rowFor = (row: Row) => (
    <RailRow
      key={row.href}
      href={row.href}
      label={row.label}
      icon={kitIcon(row.icon)}
      current={row.href === current}
      badge={row.badge}
      onNavigate={onNavigate}
    />
  );

  return (
    <RailPanel title="Vane" overlay={overlay} onCollapse={onCollapse} query={query} onQuery={setQuery} shelf={shelf}>
      <ul className={styles.items}>
        {rows.filter(shown).map(rowFor)}
        {watching.some(shown) ? (
          <PanelGroup label="Watching" holdsCurrent={watching.some((row) => row.href === current)}>
            {watching.filter(shown).map(rowFor)}
          </PanelGroup>
        ) : null}
      </ul>
    </RailPanel>
  );
}
