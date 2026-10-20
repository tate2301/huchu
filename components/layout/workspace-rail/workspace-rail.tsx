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
import { RailPanel, type PanelResize } from "./rail-panel";
import { LevelRow, RailHeading, RailRow } from "./rail-row";
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
 * A module that draws its own panel at its level (Explore's tables, Vane's
 * pages with their counts) instead of rows from the navigation model.
 */
export type AreaPanel = {
  body: React.ReactNode;
  /** Its own search and rows (Explore's), drawn as they are, outside the panel's list. */
  bare?: boolean;
  /** Wider than 240 and resized from its edge, each person's width kept (`usePanelWidth`). */
  resize?: PanelResize;
};

/** What a module's own groups draw at a level: Saved views of the page, and the module's Reports. */
export type ModuleGroupsAt = { savedViews: boolean; reports: boolean };

/**
 * The rail and its panel, side by side (00-foundations 5.3.1–5.3.3).
 *
 * The panel drills down, level by level, when the workspace is too big to show
 * at once: the workspace's module list, one module's items, and in a module
 * read whole (the CRM beside other modules) each of its groups. A row with
 * children opens its level, with the chevron before the level's title going
 * back up one level at a time; children never unfold in place. Headed bands
 * with no level of their own (Books' Ledger, Saved views, Reports from Books)
 * stay as the boards draw them. The panel stands at the page's level and
 * follows the page. A workspace small enough to fit is drawn flat: every
 * module's items under its title, and the rail carries pins alone. A module
 * with its own panel (`areaPanels`) draws it at its level. Collapsing the
 * panel is its own control.
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
  areaPanels,
  holdAtModule = false,
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
  /** Modules that draw their own panel at their level, by area id (`explore`, `vane`). */
  areaPanels?: Record<string, AreaPanel>;
  /**
   * The page is one of the module's own shelves (a CRM saved view or group),
   * listed at the module's level: the panel stands there, not in the group
   * the page's list sits in.
   */
  holdAtModule?: boolean;
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
   * its Reports. Drawn only at the level that holds the page: its Reports at
   * the module's level, Saved views of the page wherever the page's row is.
   */
  moduleGroups?: (area: RailArea, at: ModuleGroupsAt) => React.ReactNode;
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
  // the folder it sits in, changes: a deep page opens its own level.
  const pageFolderId = holdAtModule ? null : activeFolderId;
  const pageView: RailView = { areaId: activeArea?.id ?? null, folderId: pageFolderId };
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

  // A flat workspace stands at a module only to show a folder of it or a
  // module's own panel; otherwise it is every module at once.
  const viewArea = areas.find((area) => area.id === view.areaId) ?? null;
  const viewFolder = viewArea?.folders?.find((folder) => folder.id === view.folderId) ?? null;
  const shownArea =
    viewArea && (shape === "areas" || viewFolder || areaPanels?.[viewArea.id]) ? viewArea : null;
  const shownFolder = shownArea ? viewFolder : null;
  const shownPanel = shownArea && !shownFolder ? (areaPanels?.[shownArea.id] ?? null) : null;
  const resize = shownPanel?.resize;

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
      lock={item.lock}
      onNavigate={onNavigate}
      onPin={pinCapacity > 0 && !item.lock ? () => toggle(item.href) : undefined}
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

  // A module's own rows, the rows that open its groups' levels, then its
  // headed bands, then (for the page's module) its Saved views and Reports,
  // then the bands that sit last ("More").
  const areaBody = (area: RailArea) => {
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
    const isPageArea = area.id === activeArea?.id;
    return (
      <>
        {rowsFor(areaRows(area), area)}
        {(area.folders ?? []).map((folder) => {
          // A level the plan holds back whole shows once with its price and opens what the plan adds.
          const lock = levelLock(folder);
          return lock ? (
            <RailRow
              key={`folder:${folder.id}`}
              href={folder.items[0]!.href}
              label={folder.label}
              icon={folder.icon}
              current={isPageArea && folder.id === activeFolderId}
              lock={lock}
              onNavigate={onNavigate}
            />
          ) : (
            <LevelRow
              key={`folder:${folder.id}`}
              label={folder.label}
              icon={folder.icon}
              holdsPage={isPageArea && folder.id === activeFolderId}
              badge={levelBadge(folder, badges)}
              onOpen={() => setView({ areaId: area.id, folderId: folder.id })}
            />
          );
        })}
        {bands.filter((b) => !b.trailing).map((b) => band(b.id, b.label, false))}
        {isPageArea ? moduleGroups?.(area, { savedViews: !pageFolderId, reports: true }) : null}
        {bands.filter((b) => b.trailing).map((b) => band(b.id, b.label, true))}
      </>
    );
  };

  // A group's level: its rows, and the page's Saved views where the page is one of them.
  const folderBody = (area: RailArea, folder: RailFolder) => (
    <>
      {rowsFor(folder.items, area)}
      {folder.links ? (
        <PanelGroup label={folder.links.label} defaultOpen holdsCurrent={false}>
          {folder.links.items.map((item) => (
            <RailRow key={item.href} href={item.href} label={item.label} icon={item.icon} current={false} onNavigate={onNavigate} />
          ))}
        </PanelGroup>
      ) : null}
      {area.id === activeArea?.id && folder.id === pageFolderId
        ? moduleGroups?.(area, { savedViews: true, reports: false })
        : null}
    </>
  );

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
    shownArea && shownFolder && shape === "areas"
      ? { label: shownArea.label, go: () => setView({ areaId: shownArea.id, folderId: null }) }
      : shownArea
        ? { label: workspaceLabel, go: () => setView({ areaId: null, folderId: null }) }
        : null;
  // The module's own shelves (the CRM's saved views and groups) sit at its level only.
  const extraHere = shape === "flat" ? !shownArea : shownArea !== null && shownArea.id === activeArea?.id && !shownFolder;

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
  if (panelShown && shownArea && shownPanel?.bare) {
    // A panel with its own search and rows (Explore's tables), drawn as it is.
    panel = (
      <RailPanel
        title={shownArea.label}
        backLabel={back?.label}
        onBack={back?.go}
        overlay={panelOverlay}
        onCollapse={onCollapse}
        shelf={shelf}
        resize={resize}
      >
        {shownPanel.body}
      </RailPanel>
    );
  } else if (panelShown && shownArea && shownPanel && !needle) {
    panel = (
      <RailPanel
        title={shownArea.label}
        backLabel={back?.label}
        onBack={back?.go}
        overlay={panelOverlay}
        onCollapse={onCollapse}
        query={query}
        onQuery={setQuery}
        shelf={shelf}
        resize={resize}
      >
        <ul className={styles.items}>{shownPanel.body}</ul>
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
        extra={extraHere ? extra : undefined}
        shelf={shelf}
      >
        {shownArea && shownFolder ? (
          <ul className={styles.items}>{folderBody(shownArea, shownFolder)}</ul>
        ) : shape === "flat" ? (
          <ul className={styles.items}>
            {areas.map((area) => (
              <React.Fragment key={area.id}>
                <RailHeading>{area.label}</RailHeading>
                {areaBody(area)}
              </React.Fragment>
            ))}
          </ul>
        ) : shownArea ? (
          <ul className={styles.items}>{areaBody(shownArea)}</ul>
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

/** A level whose every row is locked, and which links nowhere free, is locked whole at its dearest price. */
function levelLock(folder: RailFolder): string | null {
  if (folder.items.length === 0 || folder.links?.items.length) return null;
  if (!folder.items.every((item) => item.lock)) return null;
  return [...folder.items].map((item) => item.lock!).sort().at(-1) ?? null;
}

/** The things waiting in a level: its open rows' counts, summed. */
function levelBadge(folder: RailFolder, badges: Record<string, string>): string | null {
  if (!folder.sumsCounts) return null;
  const total = folder.items.reduce((sum, item) => sum + (item.lock ? 0 : Number(badges[item.href] ?? 0) || 0), 0);
  return total > 0 ? String(total) : null;
}
