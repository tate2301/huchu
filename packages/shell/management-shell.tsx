"use client";

import { useMemo } from "react";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";

import { PageChrome } from "@corelithzw/ui/layout/page-chrome";
import { NavRail } from "@corelithzw/ui/components/nav-rail";
import { NavGroup, NavItem } from "@corelithzw/ui/components/settings-rail";
import {
  getAreaLabel,
  getVisibleManagementAreaNavItems,
  getVisibleManagementModuleItems,
  isActiveHref,
  isPathMatchingPrefix,
  type ManagementArea,
} from "./management";
import { getWorkspaceModulePresentation } from "@corelithzw/platform/workspace-products";

type ManagementShellProps = {
  area: ManagementArea;
  title: string;
  description?: string;
  actions?: React.ReactNode;
  /**
   * Skip the in-page description block. For content that draws its own header —
   * the DS `MasterData` assembly composes one — where two would say the same
   * thing twice. The app bar still gets the title and the actions either way.
   */
  hideHeader?: boolean;
  children: React.ReactNode;
};

export function ManagementShell({
  area,
  title,
  description,
  actions,
  hideHeader,
  children,
}: ManagementShellProps) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const enabledFeatures = useMemo(
    () => (session?.user as { enabledFeatures?: string[] } | undefined)?.enabledFeatures,
    [session],
  );
  const workspaceProfile = (session?.user as { workspaceProfile?: string } | undefined)?.workspaceProfile;
  const modulePresentation = useMemo(
    () =>
      getWorkspaceModulePresentation({
        moduleId: "management",
        enabledFeatures,
        workspaceProfile,
      }),
    [enabledFeatures, workspaceProfile],
  );

  const visibleModules = useMemo(
    () => getVisibleManagementModuleItems(enabledFeatures),
    [enabledFeatures],
  );
  const visibleAreaTabs = useMemo(
    () => getVisibleManagementAreaNavItems(area, enabledFeatures),
    [area, enabledFeatures],
  );
  const areaLabel = getAreaLabel(area);

  return (
    <div className="settings-layout container mx-auto w-full">
      {/* A rail on a desktop, a scrolling strip on a phone. Stacked, these
          thirteen sections were five hundred pixels of navigation above the
          page they navigate to — you scrolled past the whole of Settings to
          reach Master Data's own content. `orientation="responsive"` is what
          CRM settings already uses; this is the same rail, drawn the same
          way. */}
      <NavRail
        className="settings-rail"
        label="Management navigation"
        orientation="responsive"
      >
        <NavGroup label="Settings">
          {visibleModules.map((module) => {
            const ModuleIcon = module.icon;
            return (
              <NavItem
                key={module.id}
                to={module.href}
                active={isPathMatchingPrefix(pathname, module.matchPrefixes)}
                icon={ModuleIcon ? <ModuleIcon className="size-4" aria-hidden="true" /> : undefined}
              >
                {module.label}
              </NavItem>
            );
          })}
        </NavGroup>

        <NavGroup label={areaLabel}>
          {visibleAreaTabs.map((tab) => {
            const TabIcon = tab.icon;
            return (
              <NavItem
                key={tab.id}
                to={tab.href}
                active={isActiveHref(pathname, tab.href)}
                icon={TabIcon ? <TabIcon className="size-4" aria-hidden="true" /> : undefined}
              >
                {tab.label}
              </NavItem>
            );
          })}
        </NavGroup>
      </NavRail>

      {/* The back office's actions belong in the app bar, the same as every
          other module's.
          ==================================================================
          This shell drew its own `PageHeader` inside the page instead, which
          on a 390px screen put "New department" about four hundred pixels
          down — under a title the bar was already showing, under the
          description, and under the whole search-and-pagination row — while
          the bar itself sat empty next to the bell. The one verb on the page
          was the last thing you could reach.

          The title goes to the bar too, so it is stated once. What stays on
          the page is the description, which is the only part of the old
          header that said something the bar cannot. */}
      <PageChrome title={title || modulePresentation.title}>{actions}</PageChrome>

      <section className="settings-content">
        {hideHeader || !description ? null : (
          <p className="t-body t-muted max-w-[var(--content-max)]">{description}</p>
        )}
        <div className="w-full max-w-[96rem] space-y-6">{children}</div>
      </section>
    </div>
  );
}
