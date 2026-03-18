"use client";

import * as React from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";

import { useGuidedMode } from "@/hooks/use-guided-mode";
import { getWorkspaceSidebarModel } from "@/lib/workspaces";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import { SidebarAccountMenu } from "@/components/layout/app-sidebar/sidebar-account-menu";
import { getActiveNavHref } from "@/components/layout/app-sidebar/sidebar-helpers";
import {
  SidebarHomeLink,
  SidebarNavSections,
} from "@/components/layout/app-sidebar/sidebar-nav-sections";
import { SidebarQuickActions } from "@/components/layout/app-sidebar/sidebar-quick-actions";
import { SidebarSupport } from "@/components/layout/app-sidebar/sidebar-support";

export function AppSidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const view = searchParams.get("view");
  const { data: session } = useSession();
  const role = (session?.user as { role?: string } | undefined)?.role;
  const enabledFeatures = React.useMemo(
    () => (session?.user as { enabledFeatures?: string[] } | undefined)?.enabledFeatures,
    [session],
  );
  const workspaceProfile = (session?.user as { workspaceProfile?: string } | undefined)?.workspaceProfile;
  const { state, isMobile, setOpen } = useSidebar();
  const { enabled: guidedModeEnabled, setGuidedMode } = useGuidedMode();
  const isCollapsed = state === "collapsed";

  const sidebarModel = React.useMemo(
    () =>
      getWorkspaceSidebarModel({
        role,
        enabledFeatures,
        workspaceProfile,
      }),
    [enabledFeatures, role, workspaceProfile],
  );

  const orderedSections = React.useMemo(() => sidebarModel.sections, [sidebarModel.sections]);
  const primarySections = React.useMemo(
    () => orderedSections.filter((section) => section.workspaceGroup !== "additional"),
    [orderedSections],
  );
  const additionalSections = React.useMemo(
    () => orderedSections.filter((section) => section.workspaceGroup === "additional"),
    [orderedSections],
  );
  const secondaryItems = React.useMemo(() => sidebarModel.supportItems, [sidebarModel.supportItems]);

  const activeHref = React.useMemo(
    () => getActiveNavHref(orderedSections, pathname, view),
    [orderedSections, pathname, view],
  );
  const activeSectionId = React.useMemo(
    () =>
      orderedSections.find((section) =>
        section.items.some((item) => item.href === activeHref),
      )?.id ?? null,
    [activeHref, orderedSections],
  );
  const homeHrefExistsInSections = React.useMemo(
    () =>
      orderedSections.some((section) =>
        section.items.some((item) => item.href === sidebarModel.homeHref),
      ),
    [orderedSections, sidebarModel.homeHref],
  );
  const [openSectionId, setOpenSectionId] = React.useState<string | null>(activeSectionId);

  React.useEffect(() => {
    if (activeSectionId) {
      setOpenSectionId(activeSectionId);
    }
  }, [activeSectionId]);

  const toggleSection = React.useCallback(
    (sectionId: string) => {
      if (isCollapsed) {
        setOpen(true);
      }
      setOpenSectionId((current) => (current === sectionId ? null : sectionId));
    },
    [isCollapsed, setOpen],
  );

  return (
    <Sidebar collapsible="icon" variant="inset" className="sticky top-0">
      <SidebarHeader className="pb-2">
        <SidebarMenu className="space-y-2">
          <SidebarAccountMenu
            session={
              session
                ? {
                    user: {
                      name: session.user?.name,
                      role: (session.user as { role?: string } | undefined)?.role ?? null,
                    },
                  }
                : null
            }
            isCollapsed={isCollapsed}
            isMobile={isMobile}
          />
          <SidebarQuickActions
            items={sidebarModel.quickActions}
            pathname={pathname}
            view={view}
            isCollapsed={isCollapsed}
            isMobile={isMobile}
          />
          {!isCollapsed ? (
            <div className="px-2 pt-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                {sidebarModel.workspaceLabel}
              </p>
            </div>
          ) : null}
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {!homeHrefExistsInSections ? (
          <SidebarHomeLink
            href={sidebarModel.homeHref}
            label={sidebarModel.homeLabel}
            isActive={
              pathname === sidebarModel.homeHref &&
              !orderedSections.some((section) =>
                section.items.some((item) => item.href === activeHref),
              )
            }
          />
        ) : null}

        {primarySections.length > 0 ? (
          <SidebarGroup className="mb-0.5">
            <SidebarGroupContent className="mt-0">
              <SidebarNavSections
                sections={primarySections}
                activeHref={activeHref}
                isCollapsed={isCollapsed}
                openSectionId={openSectionId}
                onToggleSection={toggleSection}
              />
            </SidebarGroupContent>
          </SidebarGroup>
        ) : null}

        {additionalSections.length > 0 ? (
          <SidebarGroup className="mb-0.5">
            <SidebarGroupContent className="mt-0">
              <SidebarNavSections
                sections={additionalSections}
                activeHref={activeHref}
                isCollapsed={isCollapsed}
                openSectionId={openSectionId}
                onToggleSection={toggleSection}
              />
            </SidebarGroupContent>
          </SidebarGroup>
        ) : null}

        <SidebarSupport
          items={secondaryItems}
          pathname={pathname}
          view={view}
          isCollapsed={isCollapsed}
          guidedModeEnabled={guidedModeEnabled}
          onToggleGuidedMode={() => setGuidedMode(!guidedModeEnabled)}
        />
      </SidebarContent>

      <SidebarRail />
    </Sidebar>
  );
}
