"use client";

import * as React from "react";
import { usePathname } from "next/navigation";

import { ExplorePanel } from "@/components/explore/explore-panel";
import { SidebarCrmCollections } from "@/components/layout/app-sidebar/sidebar-crm-collections";
import { ArrangeSidebar } from "@/components/layout/sidebar/arrange";
import { SidebarFoot } from "@/components/layout/sidebar/foot";
import { ManagementSidebar } from "@/components/layout/sidebar/management-sidebar";
import { Rail } from "@/components/layout/sidebar/rail";
import { Sidebar } from "@/components/layout/sidebar/sidebar";
import { Switcher } from "@/components/layout/sidebar/switcher";
import { useNavPrefs } from "@/components/layout/sidebar/use-nav-prefs";
import { useShellNav } from "@/components/layout/shell-nav";
import { useShell } from "@/components/layout/shell-state";
import { usePanelWidth } from "@/components/layout/sidebar/use-panel-width";
import { VaneModulePanel } from "@/components/vane/vane-module-panel";

/**
 * Explore's panel is wider than the sidebar (its tabs and table names need
 * the room, the owner, 15 Oct), resized from its edge between these limits.
 */
const EXPLORE_PANEL_WIDTH = { initial: 320, min: 240, max: 480 };

/** A Management page's figures, on the rows they belong to. */
function managementCounts(nav: ReturnType<typeof useShellNav>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const group of nav.managementGroups) {
    for (const item of group.items) {
      if (item.gate.kind !== "settings") continue;
      const value = nav.managementCounts[item.gate.entry];
      if (typeof value === "number" && value > 0) out[item.id] = String(value);
    }
  }
  return out;
}

/**
 * The sidebar beside the page (≥720px) or as the phone's More (`MobileNav`);
 * closed, the 56px rail. On a Management page the sidebar draws Management's
 * tree in its place, the one sanctioned swap. Explore and Vane keep their own
 * column beside it.
 */
export function AppSidebar({ inDrawer = false, railOnly = false }: { inDrawer?: boolean; railOnly?: boolean }) {
  const nav = useShellNav();
  const shell = useShell();
  const pathname = usePathname();
  const { prefs, toggle, setOrder, resetOrder } = useNavPrefs(nav.companyName);
  const explore = usePanelWidth("explore", EXPLORE_PANEL_WIDTH);
  const shown = inDrawer || shell.panelShown;
  const area = railOnly ? null : pathname.startsWith("/explore") ? "explore" : pathname.startsWith("/vane") ? "vane" : null;
  const inCrm = pathname === "/crm" || pathname.startsWith("/crm/");
  const onNavigate = inDrawer ? () => shell.setDrawerOpen(false) : undefined;
  const management = nav.management ? { href: nav.management.href, current: nav.inManagement } : null;

  const rail = inDrawer ? null : (
    <Rail
      groups={nav.groups}
      active={nav.inManagement ? null : nav.active}
      prefs={prefs}
      badges={nav.badges}
      switcher={<Switcher compact />}
      management={management}
      onOpen={shell.openPanel}
    />
  );
  // Closed (or, at 720–1099px, until it is asked for) the sidebar is the rail.
  if (!shown) return rail;
  const overlay = shell.panelOverlay && !inDrawer;

  const foot = inDrawer ? null : (
    <SidebarFoot management={nav.inManagement ? null : management} onCollapse={nav.inManagement ? undefined : shell.closePanel} />
  );

  let body: React.ReactNode;
  if (shell.arranging && !inDrawer && !nav.inManagement) {
    body = (
      <ArrangeSidebar
        groups={nav.groups}
        prefs={prefs}
        onHide={(id) => toggle("hidden", id)}
        onOrder={setOrder}
        onReset={resetOrder}
        onDone={() => shell.setArranging(false)}
      />
    );
  } else if (nav.inManagement) {
    body = (
      <ManagementSidebar
        groups={nav.managementGroups}
        active={nav.managementActive}
        backHref={nav.homeHref}
        workspaceName={nav.companyName}
        prefs={prefs}
        onPref={toggle}
        counts={managementCounts(nav)}
        switcher={<Switcher />}
        foot={foot}
        onNavigate={onNavigate}
        phone={inDrawer}
      />
    );
  } else {
    body = (
      <Sidebar
        groups={nav.groups}
        active={nav.active}
        pathname={pathname}
        badges={nav.badges}
        prefs={prefs}
        onPref={toggle}
        switcher={<Switcher />}
        foot={foot}
        addHref={nav.addHref}
        onNavigate={onNavigate}
        extra={inCrm && !inDrawer ? <SidebarCrmCollections /> : null}
        phone={inDrawer}
      />
    );
  }

  return (
    <>
      {overlay ? rail : null}
      <div className={overlay ? "fixed inset-y-0 left-[56px] z-40 flex shadow-[var(--shadow-float)]" : inDrawer ? "flex h-full w-full" : "flex h-full"}>
        {body}
        {inDrawer || nav.inManagement ? null : area === "explore" ? (
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
