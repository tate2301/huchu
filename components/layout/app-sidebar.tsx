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
  User,
  Video,
  Wrench,
  type LucideIcon,
} from "@/lib/icons";
import { useSession } from "next-auth/react";

import { getNavSectionsForRole, type NavSection } from "@/lib/navigation";
import { filterNavSectionsByEnabledFeatures } from "@/lib/platform/gating/nav-filter";
import { cn } from "@/lib/utils";
import { useGuidedMode } from "@/hooks/use-guided-mode";
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
  const { enabled: guidedModeEnabled, setGuidedMode } = useGuidedMode();
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
    const order = ["hr", "gold", "stores", "maintenance", "management", "reporting", "cctv"];
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
  const companySlug = (session?.user as { companySlug?: string } | undefined)?.companySlug;
  const companyId = (session?.user as { companyId?: string } | undefined)?.companyId;
  const companyLabel = React.useMemo(() => {
    if (companySlug && companySlug.trim().length > 0) {
      return companySlug
        .split("-")
        .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
        .join(" ");
    }
    return "Current Organization";
  }, [companySlug]);
  const companyMeta = React.useMemo(() => {
    if (companySlug && companySlug.trim().length > 0) {
      return `${companySlug}.workspace`;
    }
    if (companyId) {
      return `ID ${companyId.slice(0, 8)}`;
    }
    return "Tenant context";
  }, [companyId, companySlug]);
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
                      className="h-8 text-[13px]"
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
      <SidebarHeader className="pb-2">
        <SidebarMenu className="space-y-2">
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                  tooltip="Organization"
                  className="h-[3.15rem] rounded-lg bg-sidebar-accent/75 shadow-[var(--surface-frame-shadow)]"
                >
                  <div className="bg-primary/15 text-primary flex aspect-square size-8 items-center justify-center rounded-lg shadow-[var(--surface-frame-shadow)]">
                    <Building2 className="h-4 w-4" />
                  </div>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-semibold">{companyLabel}</span>
                    <span className="truncate text-xs text-muted-foreground">{companyMeta}</span>
                  </div>
                  {!isCollapsed ? (
                    <ChevronDown className="ml-auto h-4 w-4 text-muted-foreground" />
                  ) : null}
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                side={isCollapsed ? "right" : isMobile ? "bottom" : "bottom"}
                className="w-64 border-0 shadow-[var(--surface-frame-shadow)]"
              >
                <DropdownMenuLabel>Organization</DropdownMenuLabel>
                <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                  {companyMeta}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/">
                    <Home className="h-4 w-4" />
                    Workspace Home
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/help">
                    <FileCheck className="h-4 w-4" />
                    Platform Playbook
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem disabled>
                  <Building2 className="h-4 w-4" />
                  Switch Organization (Soon)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup className="mb-0.5">
          {!isCollapsed ? (
            <SidebarGroupLabel className="px-2 pb-1 text-xs uppercase">
              Workspace
            </SidebarGroupLabel>
          ) : null}
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={pathname === "/"}
                  tooltip="Home"
                  className="h-9 font-semibold"
                >
                  <Link href="/">
                    <Home className="h-4 w-4" />
                    <span className="font-semibold">Home</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {orderedSections.length > 0 ? (
          <SidebarGroup className="mb-0.5">
            {!isCollapsed ? (
              <SidebarGroupLabel className="px-2 pb-1 text-xs uppercase">
                Platform
              </SidebarGroupLabel>
            ) : null}
            <SidebarGroupContent className="mt-0">
              {orderedSections.map((section) => renderSection(section))}
            </SidebarGroupContent>
          </SidebarGroup>
        ) : null}

        {quickActionsSection ? (
          <SidebarGroup className="mb-0.5">
            {!isCollapsed ? (
              <SidebarGroupLabel className="px-2 pb-1 text-xs uppercase">
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
                        className="h-9 bg-primary text-primary-foreground shadow-[var(--surface-frame-shadow)] hover:bg-primary/90 hover:text-primary-foreground data-[active=true]:bg-primary data-[active=true]:text-primary-foreground"
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
                      className="w-64 border-0 shadow-[var(--surface-frame-shadow)]"
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
                    tooltip={guidedModeEnabled ? "Guided tips are on" : "Guided tips are off"}
                    className="h-8 text-[12px]"
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
                      className="h-8 text-[12px]"
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

      <SidebarFooter className="pt-2">
        {session ? (
          <div className="space-y-1.5 rounded-lg bg-sidebar-accent/55 p-1.5 shadow-[var(--surface-frame-shadow)]">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  tooltip="Account"
                  className="h-10 rounded-lg bg-sidebar-accent/65 shadow-[var(--surface-frame-shadow)]"
                >
                  <div className="bg-primary/15 text-primary flex size-8 items-center justify-center rounded-md text-xs font-semibold shadow-[var(--surface-frame-shadow)]">
                    {getInitials(session.user?.name)}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-semibold text-foreground">
                      {session.user?.name ?? "User"}
                    </p>
                    <p className="truncate text-xs uppercase tracking-[0.08em] text-muted-foreground">
                      {(session.user as { role?: string })?.role ?? "User"}
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
                className="w-64 border-0 shadow-[var(--surface-frame-shadow)]"
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
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
