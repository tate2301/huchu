"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  ChevronDown,
  ChevronRight,
  Coins,
  Dashboard,
  FileCheck,
  Home,
  LogOut,
  ManageAccounts,
  Package,
  Plus,
  User,
  Video,
  Wrench,
  type LucideIcon,
} from "@/lib/icons";
import { useSession } from "next-auth/react";

import { getNavSectionsForRole, type NavSection } from "@/lib/navigation";
import { filterNavSectionsByEnabledFeatures } from "@/lib/platform/gating/nav-filter";
import { cn } from "@/lib/utils";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
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
  stores: Package,
  maintenance: Wrench,
  hr: ManageAccounts,
  cctv: Video,
  management: Dashboard,
};

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
    () => (session?.user as { enabledFeatures?: string[] } | undefined)?.enabledFeatures,
    [session],
  );
  const { state, isMobile, setOpen } = useSidebar();
  const isCollapsed = state === "collapsed";
  const sections = React.useMemo(() => {
    const roleSections = getNavSectionsForRole(role);
    return filterNavSectionsByEnabledFeatures(roleSections, enabledFeatures);
  }, [enabledFeatures, role]);
  const overviewSection = React.useMemo(
    () => sections.find((section) => section.id === "overview"),
    [sections],
  );
  const contentSections = React.useMemo(
    () =>
      sections.filter(
        (section) => section.id !== "overview" && section.id !== "daily",
      ),
    [sections],
  );
  const quickActionsSection = React.useMemo(
    () => sections.find((section) => section.id === "daily"),
    [sections],
  );
  const orderedSections = React.useMemo(() => {
    const order = ["gold", "stores", "maintenance", "hr", "cctv", "management", "reporting"];
    const rank = new Map(order.map((id, index) => [id, index]));
    return contentSections
      .slice()
      .sort((a, b) => {
        const aRank = rank.get(a.id);
        const bRank = rank.get(b.id);
        if (aRank === undefined && bRank === undefined) {
          return a.title.localeCompare(b.title);
        }
        if (aRank === undefined) return 1;
        if (bRank === undefined) return -1;
        return aRank - bRank;
      });
  }, [contentSections]);
  const secondaryItems = React.useMemo(
    () => (overviewSection?.items ?? []).filter((item) => item.href !== "/"),
    [overviewSection],
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

  const renderSection = (
    section: (typeof orderedSections)[number],
  ) => {
    const SectionIcon = getSectionIcon(section);
    const isOpen = openSectionId === section.id;
    const hasActiveChild = section.items.some((item) =>
      hasActiveHref(item.href, pathname, view),
    );

    return (
      <SidebarGroup key={section.id}>
        <SidebarGroupLabel className="p-0">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                type="button"
                onClick={() => toggleSection(section.id)}
                isActive={hasActiveChild}
                tooltip={section.title}
                className="h-9 font-medium"
              >
                <SectionIcon className="h-4 w-4" />
                <span>{section.title}</span>
                {!isCollapsed ? (
                  <ChevronRight
                    className={cn(
                      "ml-auto h-4 w-4 transition-transform",
                      isOpen ? "rotate-90" : "",
                    )}
                  />
                ) : null}
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroupLabel>
        {!isCollapsed && isOpen ? (
          <SidebarGroupContent>
            <SidebarMenu className="pl-5">
              {section.items.map((item) => {
                const isActive = hasActiveHref(item.href, pathname, view);
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      size="sm"
                      isActive={isActive}
                      tooltip={item.label}
                      className="h-8"
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

  return (
    <Sidebar collapsible="icon" variant="inset" className="sticky top-0">
      <SidebarHeader className="border-b border-border/70 pb-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              asChild
              tooltip="Go to home"
              className="h-12 rounded-lg border border-border/70 bg-card/60"
            >
              <Link href="/">
                <div className="bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg">
                  <Home className="h-4 w-4" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">Huchu Operations</span>
                  <span className="truncate text-sm text-muted-foreground">
                    Mine control
                  </span>
                </div>
                {!isCollapsed ? (
                  <ChevronDown className="ml-auto h-4 w-4 text-muted-foreground" />
                ) : null}
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {quickActionsSection ? (
          <SidebarGroup className="mb-1">
            {!isCollapsed ? (
              <SidebarGroupLabel className="px-2 pb-1 text-sm">
                Create
              </SidebarGroupLabel>
            ) : null}
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <SidebarMenuButton
                        variant="default"
                        className="bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground data-[active=true]:bg-primary data-[active=true]:text-primary-foreground"
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
                      className="w-64"
                    >
                      <DropdownMenuLabel>Create & Log</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      {quickActionsSection.items.map((item) => {
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

        {orderedSections.length > 0 ? (
          <SidebarGroup>
            {!isCollapsed ? (
              <SidebarGroupLabel className="px-2 pb-1 text-sm">
                Platform
              </SidebarGroupLabel>
            ) : null}
            <SidebarGroupContent className="mt-0">
              {orderedSections.map((section) => renderSection(section))}
            </SidebarGroupContent>
          </SidebarGroup>
        ) : null}

        {secondaryItems.length > 0 ? (
          <SidebarGroup className="mt-auto">
            {!isCollapsed ? (
              <SidebarGroupLabel className="px-2 text-sm font-medium text-muted-foreground">
                Support
              </SidebarGroupLabel>
            ) : null}
            <SidebarGroupContent>
              <SidebarMenu>
                {secondaryItems.map((item) => {
                  const isActive = hasActiveHref(item.href, pathname, view);
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        asChild
                        size="sm"
                        isActive={isActive}
                        tooltip={item.label}
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

      <SidebarFooter className="border-t border-border/70 pt-3">
        {session ? (
          <div className="space-y-2 rounded-lg border border-border/70 bg-card/60 p-2">
            {!isCollapsed ? (
              <div className="flex items-center gap-2 px-1 py-1">
                <div className="bg-sidebar-accent text-sidebar-accent-foreground flex size-8 items-center justify-center rounded-lg text-sm font-semibold">
                  {getInitials(session.user?.name)}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">
                    {session.user?.name ?? "User"}
                  </p>
                  <p className="truncate text-sm text-muted-foreground">
                    {(session.user as { role?: string })?.role ?? "User"}
                  </p>
                </div>
              </div>
            ) : null}
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip="Go to home">
                  <Link href="/">
                    <Home className="h-4 w-4" />
                    <span>Home</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip="Sign out">
                  <Link href="/api/auth/signout">
                    <LogOut className="h-4 w-4" />
                    <span>Sign Out</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </div>
        ) : (
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild tooltip="Go to home">
                <Link href="/">
                  <Home className="h-4 w-4" />
                  <span>Home</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
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
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
