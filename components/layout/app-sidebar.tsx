"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  Building2,
  ChevronDown,
  ChevronRight,
  Coins,
  Dashboard,
  FileCheck,
  HelpCircle,
  Home,
  LogOut,
  ManageAccounts,
  Package,
  Plus,
  Recycle,
  Scale,
  User,
  Video,
  Wrench,
  type LucideIcon,
} from "@/lib/icons";
import { useSession } from "next-auth/react";

import type { NavSection } from "@/lib/navigation";
import { cn } from "@/lib/utils";
import { useGuidedMode } from "@/hooks/use-guided-mode";
import { getWorkspaceSidebarModel } from "@/lib/workspaces";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function hasActiveHref(href: string, pathname: string, view: string | null) {
  if (href === "/") return pathname === "/";
  if (!href.includes("?")) return pathname === href;
  const [path, query] = href.split("?");
  if (pathname !== path) return false;
  const params = new URLSearchParams(query);
  const expectedView = params.get("view");
  return expectedView ? expectedView === view : true;
}

function getInitials(name: string | null | undefined) {
  if (!name) return "HU";
  const parts = name
    .split(" ")
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 2);
  if (parts.length === 0) return "HU";
  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("");
}

const sectionIcons: Record<string, LucideIcon> = {
  reporting: FileCheck,
  gold: Coins,
  "scrap-metal": Recycle,
  stores: Package,
  maintenance: Wrench,
  hr: ManageAccounts,
  cctv: Video,
  settings: Dashboard,
  schools: Building2,
  "car-sales": Package,
  thrift: Coins,
  accounting: Scale,
  management: ManageAccounts,
};
const FLAT_SECTION_IDS = new Set(["schools", "car-sales", "thrift"]);

function getSectionIcon(section: NavSection) {
  return sectionIcons[section.id] ?? section.items[0]?.icon ?? Home;
}

export function AppSidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const view = searchParams.get("view");
  const { data: session } = useSession();
  const role = (session?.user as { role?: string } | undefined)?.role;
  const enabledFeatures = React.useMemo(
    () =>
      (session?.user as { enabledFeatures?: string[] } | undefined)
        ?.enabledFeatures,
    [session],
  );
  const workspaceProfile = (session?.user as { workspaceProfile?: string } | undefined)
    ?.workspaceProfile;
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
  const orderedSections = React.useMemo(
    () => sidebarModel.sections,
    [sidebarModel.sections],
  );
  const primarySections = React.useMemo(
    () =>
      orderedSections.filter((section) => section.workspaceGroup !== "additional"),
    [orderedSections],
  );
  const additionalSections = React.useMemo(
    () => orderedSections.filter((section) => section.workspaceGroup === "additional"),
    [orderedSections],
  );
  const secondaryItems = React.useMemo(
    () => sidebarModel.supportItems,
    [sidebarModel.supportItems],
  );
  const activeSectionId = React.useMemo(
    () =>
      orderedSections.find((section) =>
        section.items.some((item) => hasActiveHref(item.href, pathname, view)),
      )?.id ?? null,
    [orderedSections, pathname, view],
  );
  const [openSectionId, setOpenSectionId] = React.useState<string | null>(
    activeSectionId,
  );

  React.useEffect(() => {
    if (activeSectionId) {
      setOpenSectionId(activeSectionId);
    }
  }, [activeSectionId]);

  const toggleSection = (id: string) => {
    if (isCollapsed) {
      setOpen(true);
    }
    setOpenSectionId((prev) => (prev === id ? null : id));
  };

  const renderSection = (section: (typeof orderedSections)[number]) => {
    const SectionIcon = getSectionIcon(section);
    const isOpen = openSectionId === section.id;
    const hasActiveChild = section.items.some((item) =>
      hasActiveHref(item.href, pathname, view),
    );

    return (
      <SidebarGroup key={section.id} className="space-y-1">
        <SidebarGroupLabel className="p-0">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                type="button"
                onClick={() => toggleSection(section.id)}
                isActive={hasActiveChild}
                tooltip={section.title}
                className="h-10"
              >
                <SectionIcon
                  className={cn(
                    "h-4 w-4",
                    hasActiveChild ? "text-primary" : "text-muted-foreground",
                  )}
                />
                <span className="font-semibold">{section.title}</span>
                {!isCollapsed ? (
                  <ChevronRight
                    className={cn(
                      "ml-auto h-4 w-4 text-muted-foreground transition-transform",
                      isOpen ? "rotate-90" : "",
                    )}
                  />
                ) : null}
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroupLabel>
        {!isCollapsed && isOpen ? (
          <SidebarGroupContent className="pl-4 pr-1">
            <SidebarMenu className="pl-2">
              {section.items.map((item) => {
                const isActive = hasActiveHref(item.href, pathname, view);
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      size="sm"
                      isActive={isActive}
                      tooltip={item.label}
                      className="h-8 text-[12.5px]"
                    >
                      <Link href={item.href}>
                        <item.icon className="h-4 w-4" />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        ) : null}
      </SidebarGroup>
    );
  };

  const renderFlatSection = (section: (typeof orderedSections)[number]) => {
    return (
      <SidebarGroup key={section.id} className="space-y-1">
        <SidebarGroupContent>
          <SidebarMenu>
            {section.items.map((item) => {
              const isActive = hasActiveHref(item.href, pathname, view);
              return (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    size="sm"
                    isActive={isActive}
                    tooltip={item.label}
                    className="h-8 text-[12.5px]"
                  >
                    <Link href={item.href}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    );
  };

  return (
    <Sidebar collapsible="icon" variant="inset" className="sticky top-0">
      <SidebarHeader className="pb-2">
        <SidebarMenu className="space-y-2">
          {session ? (
            <div className={!isCollapsed ? "w-64" : ""}>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <SidebarMenuButton
                    tooltip="Account"
                    className="h-10 rounded-lg !p-2 hover:bg-muted"
                  >
                    <div className="bg-primary/10 text-primary flex size-8 items-center justify-center rounded-md text-xs font-semibold shadow-[var(--surface-frame-shadow)]">
                      {getInitials(session.user?.name)}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-semibold text-foreground">
                        {session.user?.name ?? "User"}
                      </p>
                    </div>
                    {!isCollapsed ? (
                      <ChevronDown className="ml-auto h-4 w-4 text-muted-foreground" />
                    ) : null}
                  </SidebarMenuButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="start"
                  side={isCollapsed ? "right" : isMobile ? "bottom" : "top"}
                  className="w-64 rounded-xl border-0 shadow-[var(--elevation-3)]"
                >
                  <DropdownMenuLabel>Account</DropdownMenuLabel>
                  <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                    {(session.user as { role?: string })?.role ?? "User"}
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href="/help">
                      <HelpCircle className="h-4 w-4" />
                      Quick Tips
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/api/auth/signout">
                      <LogOut className="h-4 w-4" />
                      Sign Out
                    </Link>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ) : (
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild size="lg" tooltip="Login">
                  <Link href="/login">
                    <div className="bg-sidebar-accent text-sidebar-accent-foreground flex aspect-square size-8 items-center justify-center rounded-lg">
                      <User className="h-4 w-4" />
                    </div>
                    <div className="grid flex-1 text-left text-sm leading-tight">
                      <span className="truncate font-medium">Login</span>
                      <span className="truncate text-sm text-muted-foreground">
                        Access account
                      </span>
                    </div>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          )}
          {sidebarModel.quickActions.length > 0 ? (
            <SidebarGroup className="mb-0.5">
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <SidebarMenuButton
                          variant="default"
                          className="font-semibold bg-primary text-primary-foreground shadow-[var(--surface-frame-shadow)] hover:bg-primary/90 hover:text-primary-foreground data-[active=true]:bg-primary data-[active=true]:text-primary-foreground"
                          tooltip="Daily Shortcuts"
                        >
                          <Plus className="h-4 w-4" />
                          <span className="font-medium">Quick Actions</span>
                          {!isCollapsed ? (
                            <ChevronDown className="ml-auto h-4 w-4" />
                          ) : null}
                        </SidebarMenuButton>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="start"
                        side={
                          isCollapsed ? "right" : isMobile ? "bottom" : "bottom"
                        }
                        className="w-64 rounded-xl border-0 shadow-[var(--elevation-3)]"
                      >
                        <DropdownMenuLabel>Create & Log</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        {sidebarModel.quickActions.map((item) => {
                          const isActive = hasActiveHref(
                            item.href,
                            pathname,
                            view,
                          );
                          return (
                            <DropdownMenuItem key={item.href} asChild>
                              <Link
                                href={item.href}
                                className={cn(
                                  "flex w-full items-center gap-2",
                                  isActive
                                    ? "bg-accent text-accent-foreground"
                                    : "",
                                )}
                              >
                                <item.icon className="h-4 w-4" />
                                <span>{item.label}</span>
                              </Link>
                            </DropdownMenuItem>
                          );
                        })}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ) : null}
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={pathname === sidebarModel.homeHref}
                  tooltip={sidebarModel.homeLabel}
                  className="h-9 font-semibold"
                >
                  <Link href={sidebarModel.homeHref}>
                    <Home className="h-4 w-4" />
                    <span className="font-semibold">{sidebarModel.homeLabel}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {primarySections.length > 0 ? (
          <SidebarGroup className="mb-0.5">
            <SidebarGroupContent className="mt-0">
              {primarySections.map((section) =>
                FLAT_SECTION_IDS.has(section.id)
                  ? renderFlatSection(section)
                  : renderSection(section),
              )}
            </SidebarGroupContent>
          </SidebarGroup>
        ) : null}

        {additionalSections.length > 0 ? (
          <SidebarGroup className="mb-0.5">
            {!isCollapsed ? (
              <SidebarGroupLabel className="px-2 text-xs uppercase">
                Additional Modules
              </SidebarGroupLabel>
            ) : null}
            <SidebarGroupContent className="mt-0">
              {additionalSections.map((section) =>
                FLAT_SECTION_IDS.has(section.id)
                  ? renderFlatSection(section)
                  : renderSection(section),
              )}
            </SidebarGroupContent>
          </SidebarGroup>
        ) : null}

        {secondaryItems.length > 0 ? (
          <SidebarGroup className="mt-auto">
            {!isCollapsed ? (
              <SidebarGroupLabel className="px-2 text-xs uppercase">
                Support
              </SidebarGroupLabel>
            ) : null}
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    type="button"
                    isActive={guidedModeEnabled}
                    tooltip={
                      guidedModeEnabled
                        ? "Guided tips are on"
                        : "Guided tips are off"
                    }
                    className="h-8 text-[12.5px]"
                    onClick={() => setGuidedMode(!guidedModeEnabled)}
                  >
                    <HelpCircle className="h-4 w-4" />
                    <span>Guided Tips</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                {secondaryItems.map((item) => {
                  const isActive = hasActiveHref(item.href, pathname, view);
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        asChild
                        size="sm"
                        isActive={isActive}
                        tooltip={item.label}
                        className="h-8 text-[12.5px]"
                      >
                        <Link href={item.href}>
                          <item.icon className="h-4 w-4" />
                          <span>{item.label}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ) : null}
      </SidebarContent>

      <SidebarRail />
    </Sidebar>
  );
}
