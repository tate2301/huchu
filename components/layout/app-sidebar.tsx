"use client";

import { usePathname } from "next/navigation";

import { SidebarCrmCollections } from "@/components/layout/app-sidebar/sidebar-crm-collections";
import { AccountMenu } from "@/components/layout/account-menu";
import { PersonMenu } from "@/components/layout/person-menu";
import { useShellNav } from "@/components/layout/shell-nav";
import { useShell } from "@/components/layout/shell-state";
import { WorkspaceRail } from "@/components/layout/workspace-rail";
import { ModuleGroups } from "@/components/layout/workspace-rail/module-groups";
import { useVaneStatus } from "@/components/vane/use-vane";
import { VaneModulePanel } from "@/components/vane/vane-module-panel";
import { isVanePath } from "@/components/vane/vane-nav";

/**
 * The rail and its panel, beside the page (≥720px) or inside the phone drawer
 * (`MobileNav`).
 */
export function AppSidebar({ inDrawer = false }: { inDrawer?: boolean }) {
  const nav = useShellNav();
  const shell = useShell();
  const panelShown = inDrawer || shell.panelShown;
  const pathname = usePathname();
  const onVane = isVanePath(pathname);
  const vaneStatus = useVaneStatus();

  return (
    <WorkspaceRail
      model={nav.rail}
      workspaceLabel={nav.model.workspaceLabel}
      activeHref={nav.activeHref}
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
      ownPanel={onVane ? { title: "Vane", body: <VaneModulePanel /> } : null}
      supportItems={nav.model.supportItems}
      panelShown={panelShown}
      panelOverlay={!inDrawer && shell.panelOverlay}
      onCollapse={inDrawer ? () => shell.setDrawerOpen(false) : shell.closePanel}
      onOpenPanel={shell.openPanel}
      extra={<SidebarCrmCollections />}
      moduleGroups={(area) => (
        <ModuleGroups
          area={area}
          areas={nav.rail.areas}
          // The CRM's lists keep their own saved views (`SidebarCrmCollections`).
          savedViews={!nav.activeHref?.startsWith("/crm")}
        />
      )}
    />
  );
}
