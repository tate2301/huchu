"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { useSession } from "next-auth/react";

import { getNavSectionsForRole, getQuickActionsForRole } from "@/lib/navigation";
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

function hasActiveHref(href: string, pathname: string, view: string | null) {
  if (href === "/") return pathname === "/";
  if (!href.includes("?")) return pathname === href;
  const [path, query] = href.split("?");
  if (pathname !== path) return false;
  const params = new URLSearchParams(query);
  const expectedView = params.get("view");
  return expectedView ? expectedView === view : true;
}

export function AppSidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const view = searchParams.get("view");
  const { data: session } = useSession();
  const role = (session?.user as { role?: string } | undefined)?.role;
  const { state } = useSidebar();
  const isCollapsed = state === "collapsed";
  const sections = React.useMemo(() => getNavSectionsForRole(role), [role]);
  const quickActions = React.useMemo(() => getQuickActionsForRole(role), [role]);
  const [openSections, setOpenSections] = React.useState(
    () => new Set(sections.map((section) => section.id)),
  );

  React.useEffect(() => {
    setOpenSections(new Set(sections.map((section) => section.id)));
  }, [sections]);

  const toggleSection = (id: string) => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  return (
    <Sidebar collapsible="icon" className="sticky top-0">
      <SidebarHeader>
        <Link href="/" className="text-base font-semibold text-foreground">
          Huchu
        </Link>
      </SidebarHeader>
      <SidebarContent>
        {!isCollapsed ? (
          <SidebarGroup>
            <SidebarGroupLabel className="px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Today&apos;s Work
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {quickActions.slice(0, 5).map((action) => (
                  <SidebarMenuItem key={action.href}>
                    <SidebarMenuButton asChild tooltip={action.description}>
                      <Link href={action.href}>
                        <action.icon className="h-4 w-4" />
                        <span>{action.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ) : null}

        {sections.map((section) => {
          const isOpen = openSections.has(section.id);
          return (
            <SidebarGroup key={section.id}>
              {!isCollapsed ? (
                <SidebarGroupLabel className="p-0">
                  <button
                    type="button"
                    onClick={() => toggleSection(section.id)}
                    className="flex w-full items-center justify-between rounded-md px-2 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
                  >
                    <span>{section.title}</span>
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 transition-transform",
                        isOpen ? "rotate-180" : "rotate-0",
                      )}
                    />
                  </button>
                </SidebarGroupLabel>
              ) : null}
              {isOpen || isCollapsed ? (
                <SidebarGroupContent>
                  <SidebarMenu>
                    {section.items.map((item) => {
                      const isActive = hasActiveHref(item.href, pathname, view);
                      return (
                        <SidebarMenuItem key={item.href}>
                          <SidebarMenuButton
                            asChild
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
              ) : null}
            </SidebarGroup>
          );
        })}
      </SidebarContent>
      <SidebarFooter>
        {session ? (
          <div className="flex items-center justify-between gap-2 px-2 text-xs">
            <div className="min-w-0">
              <div className="truncate font-semibold text-foreground">
                {session.user?.name}
              </div>
              <div className="truncate text-muted-foreground">
                {(session.user as { role?: string })?.role ?? "User"}
              </div>
            </div>
            <Link
              href="/api/auth/signout"
              className="text-muted-foreground hover:text-foreground"
            >
              Sign Out
            </Link>
          </div>
        ) : (
          <Link
            href="/login"
            className="flex items-center justify-center rounded-md border border-border px-3 py-2 text-xs text-muted-foreground hover:text-foreground"
          >
            Login
          </Link>
        )}
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
