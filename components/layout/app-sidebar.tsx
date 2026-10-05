"use client";

import { SidebarCrmCollections } from "@/components/layout/app-sidebar/sidebar-crm-collections";
import { AccountMenu } from "@/components/layout/account-menu";
import { PersonMenu } from "@/components/layout/person-menu";
import { useShellNav } from "@/components/layout/shell-nav";
import { useShell } from "@/components/layout/shell-state";
import { WorkspaceRail } from "@/components/layout/workspace-rail";

/**
 * The rail and its panel, beside the page (≥720px) or inside the phone drawer
 * (`MobileNav`).
 */
export function AppSidebar({ inDrawer = false }: { inDrawer?: boolean }) {
  const nav = useShellNav();
  const shell = useShell();
  const panelShown = inDrawer || shell.panelShown;

  return (
    <WorkspaceRail
      model={nav.rail}
      workspaceLabel={nav.model.workspaceLabel}
      activeHref={nav.activeHref}
      badges={nav.badges}
      tile={<AccountMenu />}
      person={<PersonMenu />}
      management={nav.management}
      supportItems={nav.model.supportItems}
      panelShown={panelShown}
      panelOverlay={!inDrawer && shell.panelOverlay}
      onCollapse={inDrawer ? () => shell.setDrawerOpen(false) : shell.closePanel}
      onOpenPanel={shell.openPanel}
      onSearch={() => {
        if (inDrawer) shell.setDrawerOpen(false);
        shell.setCommandOpen(true);
      }}
      extra={<SidebarCrmCollections />}
    />
  );
}
