"use client";

import * as React from "react";
import Link from "next/link";

import { MedusaCogSixToothIcon, Package } from "@/lib/icons";
import { isSettingsSurfacePath } from "@/lib/settings/management-nav";
import type { NavItem } from "@/lib/navigation";
import type { RailArea } from "@/lib/rail/areas";
import { areaForHref, type RailModel } from "@/lib/rail/model";
import { orderRows } from "@/lib/rail/order";

import { RailPanel } from "./rail-panel";
import { RailHeading, RailRow } from "./rail-row";
import { SwitcherRail, type RailMark } from "./switcher-rail";
import { usePins } from "./use-pins";
import styles from "./workspace-rail.module.css";

/**
 * Where a module opens: its first page inside the shell. A module may list a
 * page of the full-screen settings surface (Setup's Shop), which is a place to
 * go to from the module, not the module's own front page.
 */
function landingHref(area: RailArea): string {
  const inShell = area.items.find((item) => !isSettingsSurfacePath(item.href.split("?")[0] ?? item.href));
  return (inShell ?? area.items[0])?.href ?? "#";
}

/**
 * The rail and its panel, side by side (00-foundations 5.3.1–5.3.3).
 *
 * The panel has two levels when the workspace is too big to show at once: the
 * workspace's module list, and one module's items. It opens on the module the
 * page belongs to; the chevron before the module's title goes back up to the
 * module list, and picking a module there opens its items. A workspace small
 * enough to fit is drawn flat: every module's items under its title, and the
 * rail carries pins alone. Collapsing the panel is its own control.
 */
export function WorkspaceRail({
  model,
  workspaceLabel,
  activeHref,
  badges,
  tile,
  person,
  management,
  supportItems = [],
  panelShown,
  panelOverlay,
  onCollapse,
  onOpenPanel,
  onSearch,
  onNavigate,
  extra,
}: {
  model: RailModel;
  /** The workspace's name: the module list's title ("Retail"). */
  workspaceLabel: string;
  activeHref: string | null;
  badges: Record<string, string>;
  tile: React.ReactNode;
  /** The person at the foot of the rail, with their menu. */
  person?: React.ReactNode;
  /** The Management surface: the gear at the foot of the rail and a shelf row. */
  management: NavItem | null;
  /** Help, on the shelf above Management. */
  supportItems?: NavItem[];
  panelShown: boolean;
  panelOverlay?: boolean;
  onCollapse?: () => void;
  onOpenPanel: () => void;
  onSearch?: () => void;
  onNavigate?: () => void;
  extra?: React.ReactNode;
}) {
  const { shape, areas, pinCapacity } = model;
  const activeArea = React.useMemo(() => areaForHref(areas, activeHref), [areas, activeHref]);

  // Which module the panel is showing; `null` is the module list, which is a
  // legitimate place to stand: you are looking at the workspace, not inside
  // one of its modules. It follows the page whenever the page's module changes.
  const [viewAreaId, setViewAreaId] = React.useState<string | null>(activeArea?.id ?? null);
  const [followedAreaId, setFollowedAreaId] = React.useState<string | null>(activeArea?.id ?? null);
  if ((activeArea?.id ?? null) !== followedAreaId) {
    setFollowedAreaId(activeArea?.id ?? null);
    if (activeArea) setViewAreaId(activeArea.id);
  }

  const { pins, isPinned, toggle } = usePins(workspaceLabel, pinCapacity);

  const byHref = React.useMemo(() => {
    const map = new Map<string, NavItem>();
    for (const area of areas) for (const item of area.items) map.set(item.href, item);
    return map;
  }, [areas]);

  const pinnedItems = orderRows(
    pins.map((href) => byHref.get(href)).filter((item): item is NavItem => Boolean(item)),
    { label: (item) => item.label },
  );

  const shownArea = shape === "areas" ? (areas.find((area) => area.id === viewAreaId) ?? null) : null;

  const groups: RailMark[][] = [
    shape === "areas"
      ? areas.map((area) => ({
          id: area.id,
          label: area.label,
          icon: area.icon,
          href: landingHref(area),
          current: area.id === activeArea?.id,
          onSelect: () => setViewAreaId(area.id),
        }))
      : [],
    pinnedItems.map((item) => ({
      id: `pin:${item.href}`,
      label: item.label,
      icon: item.icon,
      href: item.href,
      current: item.href === activeHref,
    })),
  ];

  const managementMark: RailMark | null = management
    ? {
        id: "management",
        label: management.label,
        icon: management.icon,
        href: management.href,
        current: false,
      }
    : null;

  const rowFor = (item: NavItem) => (
    <RailRow
      key={item.href}
      href={item.href}
      label={item.label}
      icon={item.icon}
      current={item.href === activeHref}
      badge={badges[item.href]}
      onNavigate={onNavigate}
      onPin={pinCapacity > 0 ? () => toggle(item.href) : undefined}
      pinned={isPinned(item.href)}
    />
  );

  const rowsFor = (area: RailArea) =>
    orderRows(area.items, {
      label: (item) => item.label,
      rank: (item) => item.rank,
      isPinned: (item) => isPinned(item.href),
      alphabetical: area.ranked === true,
    }).map(rowFor);

  const shelfItems = management ? [...supportItems, management] : supportItems;
  const shelf =
    shelfItems.length > 0 ? (
      <ul className={styles.items}>
        {shelfItems.map((item) => (
          <RailRow
            key={item.href}
            href={item.href}
            label={item.label}
            icon={item.icon}
            current={item.href === activeHref}
            onNavigate={onNavigate}
          />
        ))}
      </ul>
    ) : null;

  let panel: React.ReactNode = null;
  if (panelShown && areas.length === 0) {
    panel = (
      <RailPanel title={workspaceLabel} overlay={panelOverlay} onCollapse={onCollapse} onSearch={onSearch} shelf={shelf}>
        <div className={styles.empty}>
          <span className={styles.emptyMark}>
            <Package className={styles.itemIcon} />
          </span>
          <p className={styles.emptyLabel}>No modules yet</p>
          <Link href="/management/master-data" className={styles.find}>
            <MedusaCogSixToothIcon className={styles.findIcon} />
            <span className={styles.findLabel}>Turn one on</span>
          </Link>
        </div>
      </RailPanel>
    );
  } else if (panelShown) {
    panel = (
      <RailPanel
        title={shownArea ? shownArea.label : workspaceLabel}
        backLabel={workspaceLabel}
        onBack={shownArea ? () => setViewAreaId(null) : undefined}
        overlay={panelOverlay}
        onCollapse={onCollapse}
        onSearch={onSearch}
        extra={extra}
        shelf={shelf}
      >
        {shape === "flat" ? (
          <ul className={styles.items}>
            {areas.map((area) => (
              <React.Fragment key={area.id}>
                <RailHeading>{area.label}</RailHeading>
                {rowsFor(area)}
              </React.Fragment>
            ))}
          </ul>
        ) : shownArea ? (
          <ul className={styles.items}>{rowsFor(shownArea)}</ul>
        ) : (
          <ul className={styles.items}>
            {areas.map((area) => (
              <RailRow
                key={area.id}
                href={landingHref(area)}
                label={area.label}
                icon={area.icon}
                current={area.id === activeArea?.id}
                onNavigate={() => {
                  setViewAreaId(area.id);
                  onNavigate?.();
                }}
              />
            ))}
          </ul>
        )}
      </RailPanel>
    );
  }

  return (
    <div className={styles.nav}>
      <SwitcherRail
        tile={tile}
        groups={groups}
        management={managementMark}
        person={person}
        panelShown={panelShown}
        onOpenPanel={onOpenPanel}
      />
      {panel}
    </div>
  );
}
