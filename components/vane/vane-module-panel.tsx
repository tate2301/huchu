"use client";

import * as React from "react";
import { usePathname, useSearchParams } from "next/navigation";

import { Panel, PanelGroup, PanelRow } from "@/components/layout/sidebar/panel";
import { MedusaChartBarIcon, MedusaBookOpenIcon, Funnel, Storefront, GraduationCap, Factory, User, type LucideIcon } from "@/lib/icons";

import { useVaneStatus, useVaneWatching } from "./use-vane";
import { VANE_PAGES, vanePageFor } from "./vane-nav";

/** The mark beside a watched module in the panel. */
const WATCH_ICONS: Record<string, LucideIcon> = {
  books: MedusaBookOpenIcon,
  crm: Funnel,
  retail: Storefront,
  schools: GraduationCap,
  gold: Factory,
  people: User,
  reports: MedusaChartBarIcon,
};

/**
 * Vane's module panel (the For you board): For you, Working on, Plans, Done
 * ("12 today") and Muted, each with its count, then Watching, the modules
 * Management → Vane has it watch. A watched module opens For you with only
 * that module's cards.
 */
export function VaneModulePanel() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const status = useVaneStatus();
  const watching = useVaneWatching();
  const page = vanePageFor(pathname);
  const from = pathname === "/vane" ? searchParams.get("from") : null;

  const counts = status.data?.counts;
  const badge = (href: string): string | null => {
    if (!status.data || !counts) return null;
    const n =
      href === "/vane"
        ? status.data.open
        : href === "/vane/working"
          ? counts.working
          : href === "/vane/plans"
            ? counts.plans
            : href === "/vane/done"
              ? counts.doneToday
              : counts.muted;
    if (n <= 0) return null;
    return href === "/vane/done" ? `${n} today` : String(n);
  };

  return (
    <Panel label="Vane">
      {VANE_PAGES.map((item) => (
        <PanelRow
          key={item.href}
          href={item.href}
          label={item.label}
          icon={item.icon}
          current={item.href === page && !from}
          badge={badge(item.href)}
        />
      ))}
      {watching.data && watching.data.length > 0 ? (
        <PanelGroup label="Watching" holdsCurrent={Boolean(from)}>
          {watching.data.map((module) => (
            <PanelRow
              key={module.key}
              href={`/vane?from=${module.key}`}
              label={module.name}
              icon={WATCH_ICONS[module.key] ?? MedusaChartBarIcon}
              current={from === module.key}
                />
          ))}
        </PanelGroup>
      ) : null}
    </Panel>
  );
}
