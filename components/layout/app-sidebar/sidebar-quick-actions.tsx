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
  pathname,
  view,
}: {
  items: NavItem[];
  pathname: string;
  view: string | null;
}) {
  if (items.length === 0) return null;

  return (
    <SidebarGroup className="mb-1">
      <SidebarGroupContent className="mt-0.5">
        <SidebarMenu className="gap-0">
          {items.map((item) => {
            const isActive = matchesNavHref(item.href, pathname, view);

            return (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuButton
                  asChild
                  isActive={isActive}
                  tooltip={item.label}
                  className={cn(
                    "h-11 rounded-[10px] px-2.5 text-[14px] font-medium lg:h-9",
                    "transition-[background-color,color,transform] duration-[var(--motion-duration-fast)] ease-[var(--motion-ease-standard)] hover:translate-x-[1px] hover:bg-[var(--surface-subtle)] hover:shadow-none",
                    "data-[active=true]:border-[var(--edge-default)] data-[active=true]:bg-[var(--action-secondary-bg)] data-[active=true]:text-foreground data-[active=true]:shadow-[inset_0_0_0_1px_var(--edge-default)]",
                  )}
                >
                  <Link href={item.href}>
                    <item.icon
                      className={cn(
                        "h-4 w-4 transition-colors duration-[var(--motion-duration-fast)] ease-[var(--motion-ease-standard)]",
                        isActive ? "text-[var(--action-primary-bg)]" : "text-muted-foreground",
                      )}
                    />
                    <span className="truncate text-[14px] font-medium">{item.label}</span>
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
