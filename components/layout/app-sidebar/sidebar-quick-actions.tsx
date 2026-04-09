"use client";

import Link from "next/link";

import type { NavItem } from "@/lib/navigation";
import { cn } from "@/lib/utils";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

import { matchesNavHref } from "./sidebar-helpers";

export function SidebarQuickActions({
  items,
  badgeCount,
  pathname,
  view,
  isCollapsed,
}: {
  items: NavItem[];
  badgeCount?: number;
  pathname: string;
  view: string | null;
  isCollapsed: boolean;
}) {
  if (items.length === 0) return null;

  return (
    <SidebarGroup className="mb-1">
      <SidebarGroupContent className="mt-0.5">
        <SidebarMenu className="gap-0">
          {items.map((item, index) => {
            const isActive = matchesNavHref(item.href, pathname, view);
            const shouldShowBadge =
              !isCollapsed &&
              typeof badgeCount === "number" &&
              badgeCount > 0 &&
              index === 0;

            return (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuButton
                  asChild
                  isActive={isActive}
                  tooltip={item.label}
                  className={cn(
                    "h-9 rounded-[10px] px-2.5 text-[14px] font-medium",
                    "hover:bg-[var(--surface-subtle)] hover:shadow-none",
                    "data-[active=true]:border-transparent data-[active=true]:bg-[var(--surface-muted)] data-[active=true]:text-foreground data-[active=true]:shadow-none",
                  )}
                >
                  <Link href={item.href}>
                    <item.icon className="h-4 w-4 text-muted-foreground" />
                    <span className="truncate text-[15px] font-medium">{item.label}</span>
                    {shouldShowBadge ? (
                      <span className="ml-auto inline-flex min-w-5 items-center justify-center rounded-md bg-[#15171e] px-1.5 py-0.5 font-mono text-[11px] leading-none text-white">
                        {badgeCount}
                      </span>
                    ) : null}
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
