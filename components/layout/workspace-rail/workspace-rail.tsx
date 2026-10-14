"use client";

import * as React from "react";
import Link from "next/link";

import { MedusaCogSixToothIcon, Package } from "@/lib/icons";
import { isSettingsSurfacePath } from "@/lib/settings/management-nav";
import type { NavItem } from "@/lib/navigation";
import { areaRows, bandRows, folderForHref, type RailArea, type RailFolder } from "@/lib/rail/areas";
import { areaForHref, type RailModel } from "@/lib/rail/model";
import { orderRows } from "@/lib/rail/order";

import { PanelGroup } from "./panel-group";
import { RailPanel } from "./rail-panel";
import { RailHeading, RailRow } from "./rail-row";
import { SwitcherRail, type RailMark } from "./switcher-rail";
import { usePins } from "./use-pins";
import styles from "./workspace-rail.module.css";

/**
 * Where a module, or a folder in one, opens: its first page inside the shell.
 * A module may list a page of the full-screen settings surface (Setup's Shop),
 * which is a place to go to from the module, not the module's own front page.
 */
function landingHref(level: RailArea | RailFolder): string {
  const inShell = level.items.find((item) => !isSettingsSurfacePath(item.href.split("?")[0] ?? item.href));
  return (inShell ?? level.items[0])?.href ?? "#";
}

/**
 * Where the panel is standing: the module list (no area), a module, or a
 * folder inside a module read whole.
 */
type RailView = { areaId: string | null; folderId: string | null };

/**
 * The rail and its panel, side by side (00-foundations 5.3.1–5.3.3).
 *
 * The panel has two levels when the workspace is too big to show at once: the
 * workspace's module list, and one module's items. It opens on the module the
 * page belongs to; the chevron before the module's title goes back up to the
 * module list, and picking a module there opens its items. A module read whole
 * because its groups would not fit as marks (the CRM beside other modules)
 * keeps those groups as folders among its items: picking one goes down a
 * level, and the chevron comes back up one level at a time. A workspace small
 * enough to fit is drawn flat: every module's items under its title, and the
 * rail carries pins alone. Collapsing the panel is its own control.
 */
export function WorkspaceRail({
  model,
  workspaceLabel,
  activeHref,
  activeAreaId = null,
  badges,
  tile,
  person,
  management,
  vane,
  ownPanel = null,
  supportItems = [],
  panelShown,
  panelOverlay,
  onCollapse,
  onOpenPanel,
  onNavigate,
  extra,
  moduleGroups,
}: {
  model: RailModel;
  /** The workspace's name: the module list's title ("Retail"). */
  workspaceLabel: string;
  activeHref: string | null;
  /**
   * The page's module when no row of it is the page: a report opened from a
   * module's panel (`/books/reports/{key}`) stays in that module's panel.
   */
  activeAreaId?: string | null;
  badges: Record<string, string>;
  tile: React.ReactNode;
  /** The person at the foot of the rail, with their menu. */
  person?: React.ReactNode;
  /** The Management surface: the gear at the foot of the rail, and nowhere else. */
  management: NavItem | null;
  /** Vane, above the gear: opens and closes the Vane panel. */
  vane?: { open: boolean; count: number; working: boolean; onToggle: () => void } | null;
  /**
   * A module in no workspace's sections (Vane): while one of its pages is
   * open, the panel shows its title and its rows instead of the workspace's.
   */
  ownPanel?: { title: string; body: React.ReactNode } | null;
  /** Help, on the shelf at the panel's foot. */
  supportItems?: NavItem[];
  panelShown: boolean;
  panelOverlay?: boolean;
  onCollapse?: () => void;
  onOpenPanel: () => void;
  onNavigate?: () => void;
  extra?: React.ReactNode;
  /**
   * The groups the page's own module adds under its rows: its Saved views and
   * its Reports. Drawn only while the panel shows the module the page is in.
   */
  moduleGroups?: (area: RailArea) => React.ReactNode;
}) {
  const { shape, areas, pinCapacity } = model;
  const activeArea = React.useMemo(
    () => areaForHref(areas, activeHref) ?? (activeAreaId ? (areas.find((area) => area.id === activeAreaId) ?? null) : null),
    [areas, activeAreaId, activeHref],
  );
  const activeFolderId = activeArea ? (folderForHref(activeArea, activeHref)?.id ?? null) : null;

  // Where the panel is standing. The module list (`areaId` null) is a
  // legitimate place to stand: you are looking at the workspace, not inside
  // one of its modules. It follows the page whenever the page's module, or
  // the folder it sits in, changes.
  const pageView: RailView = { areaId: activeArea?.id ?? null, folderId: null };
  const pageViewKey = `${pageView.areaId ?? ""}/${pageView.folderId ?? ""}`;
  const [view, setView] = React.useState<RailView>(pageView);
  const [followedViewKey, setFollowedViewKey] = React.useState(pageViewKey);
  if (pageViewKey !== followedViewKey) {
    setFollowedViewKey(pageViewKey);
    if (activeArea) setView(pageView);
  }

  const { pins, isPinned, toggle } = usePins(workspaceLabel, pinCapacity);

  // The panel's search: the items, across every module, whose names match.
  const [query, setQuery] = React.useState("");
  const needle = query.trim().toLowerCase();

  const byHref = React.useMemo(() => {
    const map = new Map<string, NavItem>();
    for (const area of areas) for (const item of area.items) map.set(item.href, item);
    return map;
  }, [areas]);

  const pinnedItems = orderRows(
    pins.map((href) => byHref.get(href)).filter((item): item is NavItem => Boolean(item)),
    { label: (item) => item.label },
  );

  const shownArea = shape === "areas" ? (areas.find((area) => area.id === view.areaId) ?? null) : null;
  const shownFolder = shownArea?.folders?.find((folder) => folder.id === view.folderId) ?? null;

  const groups: RailMark[][] = [
    shape === "areas"
      ? areas.map((area) => ({
          id: area.id,
          label: area.label,
          icon: area.icon,
          href: landingHref(area),
          current: area.id === activeArea?.id,
          onSelect: () => setView({ areaId: area.id, folderId: null }),
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

  const rowsFor = (items: NavItem[], area: RailArea) =>
    orderRows(items, {
      label: (item) => item.label,
      rank: (item) => item.rank,
      isPinned: (item) => isPinned(item.href),
      alphabetical: area.ranked === true,
    }).map(rowFor);

  // A module's own rows, then its headed bands, then (for the page's module)
  // its Saved views and Reports, then the bands that sit last ("More").
  const areaBody = (area: RailArea, folderRows?: React.ReactNode) => {
    const band = (id: string, label: string, trailing: boolean) => {
      const items = bandRows(area, id);
      return (
        <PanelGroup
          key={`band:${id}`}
          label={label}
          defaultOpen={!trailing}
          holdsCurrent={items.some((item) => item.href === activeHref)}
        >
          {rowsFor(items, area)}
        </PanelGroup>
      );
    };
    const bands = area.bands ?? [];
    return (
      <>
        {rowsFor(areaRows(area), area)}
        {bands.filter((b) => !b.trailing).map((b) => band(b.id, b.label, false))}
        {folderRows}
        {area.id === activeArea?.id ? moduleGroups?.(area) : null}
        {bands.filter((b) => b.trailing).map((b) => band(b.id, b.label, true))}
      </>
    );
  };

  // A row that opens a level: a module in the module list, or a folder in a
  // module. Following it lands on the level's first page and opens the level;
  // setting the view here as well as from the page is what opens it when that
  // page is the one already showing.
  const levelRow = (level: RailArea | RailFolder, open: RailView, current: boolean) => (
    <RailRow
      key={level.id}
      href={landingHref(level)}
      label={level.label}
      icon={level.icon}
      current={current}
      onNavigate={() => {
        setView(open);
        onNavigate?.();
      }}
    />
  );

  // The chevron goes up one level: from a folder to its module, from a module
  // to the module list.
  const back =
    shownArea && shownFolder
      ? { label: shownArea.label, go: () => setView({ areaId: shownArea.id, folderId: null }) }
      : shownArea
        ? { label: workspaceLabel, go: () => setView({ areaId: null, folderId: null }) }
        : null;

  const shelf =
    supportItems.length > 0 ? (
      <ul className={styles.items}>
        {supportItems.map((item) => (
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
  if (panelShown && ownPanel && !needle) {
    panel = (
      <RailPanel
        title={ownPanel.title}
        overlay={panelOverlay}
        onCollapse={onCollapse}
        query={query}
        onQuery={setQuery}
        shelf={shelf}
      >
        <ul className={styles.items}>{ownPanel.body}</ul>
      </RailPanel>
    );
  } else if (panelShown && areas.length === 0) {
    panel = (
      <RailPanel title={workspaceLabel} overlay={panelOverlay} onCollapse={onCollapse} shelf={shelf}>
        <div className={styles.empty}>
          <span className={styles.emptyMark}>
            <Package className={styles.itemIcon} />
          </span>
          <p className={styles.emptyLabel}>No modules yet</p>
          <Link href="/management/master-data" className={styles.emptyLink}>
            <MedusaCogSixToothIcon className={styles.itemIcon} />
            Turn one on
          </Link>
        </div>
      </RailPanel>
    );
  } else if (panelShown && needle) {
    const seen = new Set<string>();
    const matches = areas.flatMap((area) =>
      area.items.filter((item) => {
        if (seen.has(item.href) || !item.label.toLowerCase().includes(needle)) return false;
        seen.add(item.href);
        return true;
      }),
    );
    panel = (
      <RailPanel
        title={workspaceLabel}
        overlay={panelOverlay}
        onCollapse={onCollapse}
        query={query}
        onQuery={setQuery}
        shelf={shelf}
      >
        {matches.length > 0 ? (
          <ul className={styles.items}>{matches.map(rowFor)}</ul>
        ) : (
          <p className={styles.noMatch}>Nothing here is called “{query.trim()}”.</p>
        )}
      </RailPanel>
    );
  } else if (panelShown) {
    panel = (
      <RailPanel
        title={shownFolder?.label ?? shownArea?.label ?? workspaceLabel}
        backLabel={back?.label}
        onBack={back?.go}
        overlay={panelOverlay}
        onCollapse={onCollapse}
        query={query}
        onQuery={setQuery}
        extra={extra}
        shelf={shelf}
      >
        {shape === "flat" ? (
          <ul className={styles.items}>
            {areas.map((area) => (
              <React.Fragment key={area.id}>
                <RailHeading>{area.label}</RailHeading>
                {areaBody(area)}
              </React.Fragment>
            ))}
          </ul>
        ) : shownArea && shownFolder ? (
          <ul className={styles.items}>{rowsFor(shownFolder.items, shownArea)}</ul>
        ) : shownArea ? (
          <ul className={styles.items}>
            {areaBody(
              shownArea,
              // A module read whole keeps its groups as headed bands in its own
              // panel, folded but for the one holding the page: a row in one
              // opens its page without leaving the module's panel.
              (shownArea.folders ?? []).map((folder) => {
                const holds = shownArea.id === activeArea?.id && folder.id === activeFolderId;
                return (
                  <PanelGroup key={`folder:${folder.id}`} label={folder.label} defaultOpen={holds} holdsCurrent={holds}>
                    {rowsFor(folder.items, shownArea)}
                  </PanelGroup>
                );
              }),
            )}
          </ul>
        ) : (
          <ul className={styles.items}>
            {areas.map((area) =>
              levelRow(area, { areaId: area.id, folderId: null }, area.id === activeArea?.id),
            )}
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
        vane={vane}
        person={person}
        panelShown={panelShown}
        onOpenPanel={onOpenPanel}
      />
      {panel}
    </div>
  );
}
