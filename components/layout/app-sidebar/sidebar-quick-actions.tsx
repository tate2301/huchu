"use client";

import Link from "next/link";

import type { NavItem } from "@/lib/navigation";
import { ChevronDown, Plus } from "@/lib/icons";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  isCollapsed,
  isMobile,
}: {
  items: NavItem[];
  pathname: string;
  view: string | null;
  isCollapsed: boolean;
  isMobile: boolean;
}) {
  if (items.length === 0) return null;

  return (
    <SidebarGroup className="mb-0.5">
      <SidebarGroupContent>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  variant="default"
                  className="bg-primary font-semibold text-primary-foreground shadow-[var(--surface-frame-shadow)] hover:bg-primary/90 hover:text-primary-foreground data-[active=true]:bg-primary data-[active=true]:text-primary-foreground"
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
                side={isCollapsed ? "right" : isMobile ? "bottom" : "bottom"}
                className="w-64 rounded-xl border-0 shadow-[var(--elevation-3)]"
              >
                <DropdownMenuLabel>Create & Log</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {items.map((item) => {
                  const isActive = matchesNavHref(item.href, pathname, view);
                  return (
                    <DropdownMenuItem key={item.href} asChild>
                      <Link
                        href={item.href}
                        className={cn(
                          "flex w-full items-center gap-2",
                          isActive ? "bg-accent text-accent-foreground" : "",
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
  );
}
