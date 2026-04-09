"use client";

import * as React from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";

import { useGuidedMode } from "@/hooks/use-guided-mode";
import { ChevronDown, Home } from "@/lib/icons";
import type { NavItem } from "@/lib/navigation";
import { getWorkspaceSidebarModel } from "@/lib/workspaces";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import { SidebarAccountMenu } from "@/components/layout/app-sidebar/sidebar-account-menu";
import { getActiveNavHref } from "@/components/layout/app-sidebar/sidebar-helpers";
import {
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
  const topQuickLinks = React.useMemo(() => {
    const links: NavItem[] = [];
    const seen = new Set<string>();
    const push = (item: NavItem | null | undefined) => {
      if (!item || seen.has(item.href)) return;
      seen.add(item.href);
      links.push(item);
    };

    push({
      href: sidebarModel.homeHref,
      label: sidebarModel.homeLabel,
      icon: Home,
    });

    for (const item of sidebarModel.quickActions) {
      if (links.length >= 2) break;
      push(item);
    }

    if (links.length < 2) {
      for (const section of orderedSections) {
        for (const item of section.items) {
          if (links.length >= 2) break;
          push(item);
        }
        if (links.length >= 2) break;
      }
    }

    if (links.length < 2) {
      for (const item of sidebarModel.supportItems) {
        if (links.length >= 2) break;
        push(item);
      }
    }

    return links.slice(0, 2);
  }, [
    orderedSections,
    sidebarModel.homeHref,
    sidebarModel.homeLabel,
    sidebarModel.quickActions,
    sidebarModel.supportItems,
  ]);
  const topQuickLinkHrefs = React.useMemo(
    () => new Set(topQuickLinks.map((item) => item.href)),
    [topQuickLinks],
  );
  const orderedSectionsWithoutTopQuickLinks = React.useMemo(
    () =>
      orderedSections
        .map((section) => ({
          ...section,
          items: section.items.filter((item) => !topQuickLinkHrefs.has(item.href)),
        }))
        .filter((section) => section.items.length > 0),
    [orderedSections, topQuickLinkHrefs],
  );
  const primarySections = React.useMemo(
    () =>
      orderedSectionsWithoutTopQuickLinks.filter(
        (section) => section.workspaceGroup !== "additional",
      ),
    [orderedSectionsWithoutTopQuickLinks],
  );
  const additionalSections = React.useMemo(
    () =>
      orderedSectionsWithoutTopQuickLinks.filter(
        (section) => section.workspaceGroup === "additional",
      ),
    [orderedSectionsWithoutTopQuickLinks],
  );
  const secondaryItems = React.useMemo(() => sidebarModel.supportItems, [sidebarModel.supportItems]);
  const quickActionBadgeCount = React.useMemo(
    () => (sidebarModel.quickActions.length > 0 ? sidebarModel.quickActions.length : undefined),
    [sidebarModel.quickActions.length],
  );

  const activeHref = React.useMemo(
    () => getActiveNavHref(orderedSections, pathname, view),
    [orderedSections, pathname, view],
  );
  const activeSectionId = React.useMemo(
    () =>
      orderedSectionsWithoutTopQuickLinks.find((section) =>
        section.items.some((item) => item.href === activeHref),
      )?.id ?? null,
    [activeHref, orderedSectionsWithoutTopQuickLinks],
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
    <Sidebar
      collapsible="icon"
      variant="inset"
      className="sticky top-3 m-3 h-[calc(100svh-1.5rem)] rounded-2xl border border-[var(--edge-default)] bg-[var(--surface-base)] shadow-none [--sidebar-width:18.75rem] [--sidebar-width-icon:3.75rem]"
    >
      <SidebarHeader className="px-3 pb-2 pt-3">
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
          workspaceLabel={sidebarModel.workspaceLabel}
          quickActions={sidebarModel.quickActions}
          pathname={pathname}
          view={view}
        />
        <SidebarQuickActions
          items={topQuickLinks}
          badgeCount={quickActionBadgeCount}
          pathname={pathname}
          view={view}
          isCollapsed={isCollapsed}
        />
      </SidebarHeader>

      <SidebarContent className="gap-2 px-2 pb-3 pt-0">
        {!isCollapsed ? (
          <SidebarSectionHeading label={sidebarModel.workspaceLabel} />
        ) : null}

        {primarySections.length > 0 ? (
          <SidebarGroup className="mb-0.5 py-0">
            <SidebarGroupContent className="mt-0 gap-0">
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
          <>
            {!isCollapsed ? <SidebarSectionHeading label="Favorites" /> : null}
            <SidebarGroup className="mb-0.5 py-0">
              <SidebarGroupContent className="mt-0 gap-0">
                <SidebarNavSections
                  sections={additionalSections}
                  activeHref={activeHref}
                  isCollapsed={isCollapsed}
                  openSectionId={openSectionId}
                  onToggleSection={toggleSection}
                />
              </SidebarGroupContent>
            </SidebarGroup>
          </>
        ) : null}

        {!isCollapsed && secondaryItems.length > 0 ? (
          <SidebarSectionHeading label="Your tools" />
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

      <SidebarRail className="right-[-3px] h-10 w-[3px] rounded-full bg-[var(--edge-strong)]" />
    </Sidebar>
  );
}

function SidebarSectionHeading({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-1 px-2 pb-1 pt-2 text-[12px] font-medium text-muted-foreground">
      <span className="truncate">{label}</span>
      <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
    </div>
  );
}
