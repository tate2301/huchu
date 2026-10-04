"use client";

import * as React from "react";
import Link from "next/link";

import { cn } from "@/lib/utils";
import {
  MedusaCogSixToothIcon,
  Package,
} from "@/lib/icons";
import type { NavItem } from "@/lib/navigation";
import type { WorkspaceNavSection, WorkspaceOption } from "@/lib/workspaces";
import { areaForHref, getRailModel } from "@/lib/rail/model";
import {
  areaRows,
  folderForHref,
  type RailArea,
  type RailFolder,
} from "@/lib/rail/areas";
import { orderRows } from "@/lib/rail/order";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

import { RailAvatar } from "./rail-avatar";
import { RailPanel } from "./rail-panel";
import { RailHeading, RailRow, RailRows } from "./rail-row";
import { SwitcherRail, type RailMark } from "./switcher-rail";
import { usePins } from "./use-pins";
import styles from "./workspace-rail.module.css";

/** The shelf: the same three rows in the same place in every workspace. */
const MANAGEMENT: NavItem = {
  href: "/management/master-data",
  label: "Management",
  icon: MedusaCogSixToothIcon,
};

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

export function WorkspaceRail({
  sections,
  workspaceLabel,
  companyName,
  companyLogoUrl,
  activeHref,
  supportItems,
  isCollapsed,
  onToggleCollapse,
  onOpenSearch,
  onOpenNew,
  onOpenSwitcher,
  workspaces,
  activeWorkspaceId,
  onSelectWorkspace,
  user,
  accountMenu,
  collections,
}: {
  sections: WorkspaceNavSection[];
  workspaceLabel: string;
  companyName: string;
  /** The workspace's branding logo, drawn as the company mark. */
  companyLogoUrl?: string | null;
  activeHref: string | null;
  supportItems: NavItem[];
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  onOpenSearch?: () => void;
  onOpenNew?: () => void;
  onOpenSwitcher?: () => void;
  /** The businesses this company runs. Fewer than two draws no switcher. */
  workspaces?: WorkspaceOption[];
  activeWorkspaceId?: string;
  onSelectWorkspace?: (id: string) => void;
  user?: { name?: string | null; image?: string | null };
  accountMenu?: React.ReactNode;
  /**
   * The user's own shelves — saved views, lists. Sits under the
   * product's own rows because it is not part of the app's structure.
   * Renders nothing outside the surface that owns it.
   */
  collections?: React.ReactNode;
}) {
  const model = React.useMemo(() => getRailModel(sections), [sections]);
  const { shape, areas, loose, pinCapacity } = model;

  const activeArea = React.useMemo(
    () => areaForHref(areas, activeHref),
    [areas, activeHref],
  );
  const activeFolderId = activeArea ? (folderForHref(activeArea, activeHref)?.id ?? null) : null;
  const looseActive = loose.some((item) => item.href === activeHref);

  // Where the panel is standing: the map (no area), an area, or a folder in
  // one. Down is a row with a caret, up is the back button, one level at a
  // time. It follows the page: opening a destination opens the level it sits
  // in, and opening one of the loose pages — Home, Overview — goes back to the
  // map, which is where those rows live.
  const [view, setView] = React.useState<{ areaId: string | null; folderId: string | null }>({
    areaId: null,
    folderId: null,
  });
  React.useEffect(() => {
    if (activeArea) setView({ areaId: activeArea.id, folderId: activeFolderId });
    else if (looseActive) setView({ areaId: null, folderId: null });
  }, [activeArea, activeFolderId, looseActive]);

  const { pins, isPinned, toggle } = usePins(workspaceLabel, pinCapacity);

  const byHref = React.useMemo(() => {
    const map = new Map<string, NavItem>();
    for (const item of loose) map.set(item.href, item);
    for (const area of areas) {
      for (const item of area.items) map.set(item.href, item);
    }
    return map;
  }, [areas, loose]);

  const pinnedItems = React.useMemo(
    () =>
      orderRows(
        pins
          .map((href) => byHref.get(href))
          .filter((item): item is NavItem => Boolean(item)),
        { label: (item) => item.label },
      ),
    [byHref, pins],
  );

  const shownArea =
    shape === "areas"
      ? (areas.find((area) => area.id === view.areaId) ?? null)
      : null;
  const shownFolder =
    shownArea?.folders?.find((folder) => folder.id === view.folderId) ?? null;

  const marks: RailMark[][] = React.useMemo(() => {
    const groups: RailMark[][] = [];
    if (shape === "areas") {
      groups.push(
        areas.map((area) => ({
          id: area.id,
          label: area.label,
          icon: area.icon,
          href: area.items[0]?.href ?? "#",
          active: area.id === activeArea?.id,
        })),
      );
    }
    if (pinnedItems.length > 0) {
      groups.push(
        pinnedItems.map((item) => ({
          id: `pin:${item.href}`,
          label: item.label,
          icon: item.icon,
          href: item.href,
          active: item.href === activeHref,
        })),
      );
    }
    return groups;
  }, [activeArea?.id, activeHref, areas, pinnedItems, shape]);

  const shelf = (
    <RailRows>
      {[...supportItems, MANAGEMENT].map((item) => (
        <RailRow
          key={item.href}
          href={item.href}
          label={item.label}
          icon={item.icon}
          dim
          active={item.href === activeHref}
        />
      ))}
    </RailRows>
  );

  const person = accountMenu ?? (
    <RailAvatar src={user?.image} name={user?.name} />
  );

  const rowFor = (item: NavItem) => (
    <RailRow
      key={item.href}
      href={item.href}
      label={item.label}
      icon={item.icon}
      active={item.href === activeHref}
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

  // A row that opens a level: the area or folder's first page, and the level
  // itself in the panel. Setting the view here as well as from the page is
  // what makes it open when that page is the one already showing.
  const levelRow = (
    level: RailArea | RailFolder,
    open: () => void,
    active: boolean,
  ) => (
    <RailRow
      key={level.id}
      href={level.items[0]?.href ?? "#"}
      label={level.label}
      icon={level.icon}
      active={active}
      onOpen={open}
    />
  );

  const looseRows = loose.length > 0 ? <RailRows>{loose.map(rowFor)}</RailRows> : null;

  const body =
    shape === "flat" ? (
      <>
        {looseRows}
        {areas.map((area) => (
          <React.Fragment key={area.id}>
            <RailHeading>{area.label}</RailHeading>
            <RailRows>{rowsFor(area.items, area)}</RailRows>
          </React.Fragment>
        ))}
      </>
    ) : shownArea && shownFolder ? (
      <RailRows>{rowsFor(shownFolder.items, shownArea)}</RailRows>
    ) : shownArea ? (
      <RailRows>
        {rowsFor(areaRows(shownArea), shownArea)}
        {(shownArea.folders ?? []).map((folder) =>
          levelRow(
            folder,
            () => setView({ areaId: shownArea.id, folderId: folder.id }),
            folder.id === activeFolderId,
          ),
        )}
      </RailRows>
    ) : (
      <>
        {looseRows}
        <RailRows>
          {areas.map((area) =>
            levelRow(
              area,
              () => setView({ areaId: area.id, folderId: null }),
              area.id === activeArea?.id,
            ),
          )}
        </RailRows>
      </>
    );

  // Back goes up one level: from a folder to its area, from an area to the map.
  const panelTitle = shownFolder?.label ?? shownArea?.label ?? workspaceLabel;
  const back = shownFolder
    ? { label: shownArea!.label, go: () => setView({ areaId: shownArea!.id, folderId: null }) }
    : shownArea
      ? { label: workspaceLabel, go: () => setView({ areaId: null, folderId: null }) }
      : null;

  if (areas.length === 0 && loose.length === 0) {
    return (
      <div className={styles.rail}>
        <SwitcherRail
          companyInitials={initialsFor(companyName)}
          companyLogoUrl={companyLogoUrl}
          companyLabel={companyName}
          onCompanyClick={onOpenSwitcher}
          workspaces={workspaces}
          activeWorkspaceId={activeWorkspaceId}
          onSelectWorkspace={onSelectWorkspace}
          groups={[]}
          person={person}
        />
        <RailPanel
          title={companyName}
          onCollapse={onToggleCollapse}
          onSearch={onOpenSearch}
          shelf={
            <RailRows>
              <RailRow {...MANAGEMENT} dim />
              {supportItems.slice(0, 1).map((item) => (
                <RailRow
                  key={item.href}
                  href={item.href}
                  label={item.label}
                  icon={item.icon}
                  dim
                />
              ))}
            </RailRows>
          }
        >
          <div className={styles.empty}>
            <span className={styles.emptyMark}>
              <Package width={18} height={18} />
            </span>
            <p className={styles.emptyLabel}>No modules yet</p>
            <Link href="/management/master-data" className={styles.find}>
              <MedusaCogSixToothIcon width={13} height={13} />
              <span className={styles.findLabel}>Turn one on</span>
            </Link>
          </div>
        </RailPanel>
      </div>
    );
  }

  return (
    <div className={cn(styles.rail)}>
      <SwitcherRail
        companyInitials={initialsFor(companyName)}
        companyLogoUrl={companyLogoUrl}
        companyLabel={companyName}
        onCompanyClick={onOpenSwitcher}
        workspaces={workspaces}
        activeWorkspaceId={activeWorkspaceId}
        onSelectWorkspace={onSelectWorkspace}
        groups={marks}
        person={person}
      />
      {isCollapsed ? null : (
        <RailPanel
          title={panelTitle}
          backLabel={back?.label}
          onBack={back?.go}
          onCollapse={onToggleCollapse}
          onSearch={onOpenSearch}
          onNew={onOpenNew}
          shelf={shelf}
        >
          {body}
          {collections}
        </RailPanel>
      )}
    </div>
  );
}

/**
 * The flyout a collapsed rail opens when a mark is pressed.
 *
 * Exported separately because a collapsed rail is still one press from
 * anywhere, and that press has to land somewhere legible.
 */
export function RailFlyout({
  title,
  items,
  activeHref,
  trigger,
}: {
  title: string;
  items: NavItem[];
  activeHref: string | null;
  trigger: React.ReactNode;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        side="right"
        align="start"
        className={cn("w-56 p-1.5", styles.flyout)}
      >
        <p className={styles.flyoutTitle}>{title}</p>
        <RailRows>
          {items.map((item) => (
            <RailRow
              key={item.href}
              href={item.href}
              label={item.label}
              icon={item.icon}
              active={item.href === activeHref}
            />
          ))}
        </RailRows>
      </PopoverContent>
    </Popover>
  );
}

