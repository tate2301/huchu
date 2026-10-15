"use client";

import * as React from "react";
import { usePathname, useSearchParams } from "next/navigation";

import { ExplorePanel } from "@/components/explore/explore-panel";
import { SidebarCrmCollections } from "@/components/layout/app-sidebar/sidebar-crm-collections";
import { AccountMenu } from "@/components/layout/account-menu";
import { PersonMenu } from "@/components/layout/person-menu";
import { useShellNav } from "@/components/layout/shell-nav";
import { useShell } from "@/components/layout/shell-state";
import { WorkspaceRail } from "@/components/layout/workspace-rail";
import { usePanelWidth } from "@/components/layout/workspace-rail/use-panel-width";
import type { AreaPanel } from "@/components/layout/workspace-rail/workspace-rail";
import { ModuleGroups } from "@/components/layout/workspace-rail/module-groups";
import { useVaneStatus } from "@/components/vane/use-vane";
import { VaneModulePanel } from "@/components/vane/vane-module-panel";

/**
 * Explore's panel is wider than a module's 240 (ExploreStudio's `.ex-nav`,
 * 280 there; the owner, 15 Oct: its tabs and table names need the room, and
 * a fourth tab is coming), resized from its edge between the board's limits.
 */
const EXPLORE_PANEL_WIDTH = { initial: 320, min: 240, max: 480 };

/**
 * The modules that draw their own panel at their level: Explore's tables and
 * Vane's pages with their counts and Watching.
 */
function useAreaPanels(): Record<string, AreaPanel> {
  const explore = usePanelWidth("explore", EXPLORE_PANEL_WIDTH);
  return React.useMemo(
    () => ({
      explore: {
        body: <ExplorePanel />,
        bare: true,
        resize: { ...EXPLORE_PANEL_WIDTH, width: explore.width, onResize: explore.resize, onDone: explore.keep },
      },
      vane: { body: <VaneModulePanel /> },
    }),
    [explore.keep, explore.resize, explore.width],
  );
}

/**
 * The rail and its panel, beside the page (≥720px) or inside the phone drawer
 * (`MobileNav`).
 */
export function AppSidebar({ inDrawer = false, railOnly = false }: { inDrawer?: boolean; railOnly?: boolean }) {
  const nav = useShellNav();
  const shell = useShell();
  // A builder keeps the rail alone; its outline stands where the panel was.
  const panelShown = inDrawer || (!railOnly && shell.panelShown);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const vaneStatus = useVaneStatus();
  const areaPanels = useAreaPanels();
  const inCrm = pathname === "/crm" || pathname.startsWith("/crm/");
  // A CRM saved view or group is listed at the CRM's own level (`SidebarCrmCollections`).
  const onCrmShelf = inCrm && (searchParams.has("view") || searchParams.has("group"));

  return (
    <WorkspaceRail
      model={nav.rail}
      workspaceLabel={nav.model.workspaceLabel}
      activeHref={nav.activeHref}
      activeAreaId={nav.currentArea?.id ?? null}
      badges={nav.badges}
      tile={<AccountMenu />}
      person={<PersonMenu />}
      management={nav.management}
      vane={{
        open: shell.vaneOpen,
        count: vaneStatus.data?.open ?? 0,
        working: Boolean(vaneStatus.data?.working),
        onToggle: () => {
          if (inDrawer) shell.setDrawerOpen(false);
          shell.setVaneOpen(!shell.vaneOpen);
        },
      }}
      areaPanels={areaPanels}
      holdAtModule={onCrmShelf}
      supportItems={nav.model.supportItems}
      panelShown={panelShown}
      panelOverlay={!inDrawer && !railOnly && shell.panelOverlay}
      onCollapse={inDrawer ? () => shell.setDrawerOpen(false) : shell.closePanel}
      onOpenPanel={shell.openPanel}
      extra={<SidebarCrmCollections />}
      moduleGroups={(area, at) => (
        <ModuleGroups
          area={area}
          areas={nav.rail.areas}
          // The CRM's lists keep their own saved views (`SidebarCrmCollections`).
          savedViews={at.savedViews && !inCrm}
          reports={at.reports}
        />
      )}
    />
  );
}
