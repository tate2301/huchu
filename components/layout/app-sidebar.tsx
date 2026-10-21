"use client";

import * as React from "react";
import { usePathname } from "next/navigation";

import { ExplorePanel } from "@/components/explore/explore-panel";
import { SidebarCrmCollections } from "@/components/layout/app-sidebar/sidebar-crm-collections";
import { AccountMenu } from "@/components/layout/account-menu";
import { PersonMenu } from "@/components/layout/person-menu";
import { Rail } from "@/components/layout/sidebar/rail";
import { Sidebar } from "@/components/layout/sidebar/sidebar";
import { useNavPrefs } from "@/components/layout/sidebar/use-nav-prefs";
import { useShellNav } from "@/components/layout/shell-nav";
import { useShell } from "@/components/layout/shell-state";
import { usePanelWidth } from "@/components/layout/sidebar/use-panel-width";
import { useVaneStatus } from "@/components/vane/use-vane";
import { VaneModulePanel } from "@/components/vane/vane-module-panel";

/**
 * Explore's panel is wider than the sidebar (its tabs and table names need
 * the room, the owner, 15 Oct), resized from its edge between these limits.
 */
const EXPLORE_PANEL_WIDTH = { initial: 320, min: 240, max: 480 };

/**
 * The sidebar, beside the page (≥720px) or inside the phone drawer
 * (`MobileNav`); closed, the 56px rail. Explore and Vane keep their own column beside it, as they
 * did at their module's level.
 */
export function AppSidebar({ inDrawer = false, railOnly = false }: { inDrawer?: boolean; railOnly?: boolean }) {
  const nav = useShellNav();
  const shell = useShell();
  const pathname = usePathname();
  const vaneStatus = useVaneStatus();
  const { prefs, toggle } = useNavPrefs(nav.companyName);
  const explore = usePanelWidth("explore", EXPLORE_PANEL_WIDTH);
  // A builder keeps the sidebar alone; its outline stands where the module column was.
  const shown = inDrawer || shell.panelShown;
  const area = railOnly ? null : pathname.startsWith("/explore") ? "explore" : pathname.startsWith("/vane") ? "vane" : null;
  const inCrm = pathname === "/crm" || pathname.startsWith("/crm/");

  const rail = inDrawer ? null : (
    <Rail
      groups={nav.groups}
      active={nav.active}
      prefs={prefs}
      tile={<AccountMenu />}
      person={<PersonMenu />}
      onOpen={shell.openPanel}
    />
  );
  // Closed (or, at 720–1099px, until it is asked for) the sidebar is the rail.
  if (!shown) return rail;
  const overlay = shell.panelOverlay && !inDrawer;
  return (
    <>
      {overlay ? rail : null}
      <div className={overlay ? "fixed inset-y-0 left-[56px] z-40 flex shadow-[var(--shadow-float)]" : "flex h-full"}>
        <Sidebar
          groups={nav.groups}
          active={nav.active}
          badges={nav.badges}
          prefs={prefs}
          onPref={toggle}
          tile={<AccountMenu />}
          person={<PersonMenu />}
          management={nav.management ? { href: nav.management.href, label: nav.management.label } : null}
          vane={{
            open: shell.vaneOpen,
            count: vaneStatus.data?.open ?? 0,
            working: Boolean(vaneStatus.data?.working),
            onToggle: () => {
              if (inDrawer) shell.setDrawerOpen(false);
              shell.setVaneOpen(!shell.vaneOpen);
            },
          }}
          onNavigate={inDrawer ? () => shell.setDrawerOpen(false) : undefined}
          extra={inCrm ? <SidebarCrmCollections /> : null}
          onCollapse={inDrawer ? undefined : shell.closePanel}
          fill={inDrawer}
        />
        {inDrawer ? null : area === "explore" ? (
          <div className="h-full flex-none bg-[var(--surface)]" style={{ width: explore.width }}>
            <ExplorePanel />
          </div>
        ) : area === "vane" ? (
          <VaneModulePanel />
        ) : null}
      </div>
    </>
  );
}
