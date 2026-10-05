"use client";

import { SidebarCrmCollections } from "@/components/layout/app-sidebar/sidebar-crm-collections";
import { AccountMenu } from "@/components/layout/account-menu";
import { useShellNav } from "@/components/layout/shell-nav";
import { useShell } from "@/components/layout/shell-state";
import { WorkspaceRail } from "@/components/layout/workspace-rail";

/**
 * The rail and the module panel, beside the page (≥720px) or inside the phone
 * drawer (`MobileNav`).
 */
export function AppSidebar({ inDrawer = false }: { inDrawer?: boolean }) {
  const nav = useShellNav();
  const shell = useShell();
  const panelShown = inDrawer || shell.panelShown;

  return (
    <WorkspaceRail
      model={nav.rail}
      currentArea={nav.currentArea}
      activeHref={nav.activeHref}
      badges={nav.badges}
      tile={<AccountMenu />}
      panelShown={panelShown}
      panelOverlay={!inDrawer && shell.panelOverlay}
      onCollapse={inDrawer ? () => shell.setDrawerOpen(false) : shell.closePanel}
      onOpenPanel={shell.openPanel}
      extra={<SidebarCrmCollections />}
    />
  );
}
