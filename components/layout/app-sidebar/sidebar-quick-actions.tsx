"use client";

import Link from "next/link";
import * as React from "react";

import type { NavItem } from "@/lib/navigation";
import { MedusaCirclePlusIcon } from "@/lib/icons";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
  quickActions,
  isCollapsed,
  isMobile,
  pathname,
  view,
}: {
  items: NavItem[];
  quickActions: NavItem[];
  isCollapsed: boolean;
  isMobile: boolean;
  pathname: string;
  view: string | null;
}) {
  if (items.length === 0 && quickActions.length === 0) return null;

  return (
    <SidebarGroup className="mb-1">
      <SidebarGroupContent className="mt-0.5">
        <SidebarMenu className="gap-0">
          {items.map((item, index) => {
            const isActive = matchesNavHref(item.href, pathname, view);

            return (
              <React.Fragment key={item.href}>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive}
                    tooltip={item.label}
                    className={cn(
                      "h-11 rounded-[10px] border border-transparent px-2.5 text-[14px] font-medium text-[var(--sidebar-item-fg-muted)] lg:h-9",
                      "transition-[background-color,color,transform] duration-[var(--motion-duration-fast)] ease-[var(--motion-ease-standard)] hover:translate-x-[1px] hover:bg-[var(--sidebar-accent)] hover:shadow-none",
                      "hover:text-[var(--sidebar-item-hover-fg)]",
                      "data-[active=true]:border-[var(--sidebar-item-active-border)] data-[active=true]:bg-[var(--sidebar-item-active-bg)] data-[active=true]:text-[var(--sidebar-item-active-fg)] data-[active=true]:shadow-[inset_0_0_0_1px_var(--sidebar-item-active-border)]",
                    )}
                  >
                    <Link href={item.href}>
                      <item.icon
                        className={cn(
                          "h-4 w-4 transition-colors duration-[var(--motion-duration-fast)] ease-[var(--motion-ease-standard)]",
                          isActive ? "text-[var(--sidebar-item-active-fg)]" : "text-[var(--sidebar-item-icon)]",
                        )}
                      />
                      <span className="truncate text-[14px] font-medium">{item.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                {index === 0 ? (
                  <SidebarMenuItem>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <SidebarMenuButton
                          tooltip="Create"
                          className={cn(
                            "h-11 rounded-[10px] border border-transparent px-2.5 text-[14px] font-medium text-[var(--sidebar-item-fg-muted)] lg:h-9",
                            "transition-[background-color,color,transform] duration-[var(--motion-duration-fast)] ease-[var(--motion-ease-standard)] hover:translate-x-[1px] hover:bg-[var(--sidebar-accent)]",
                            "hover:text-[var(--sidebar-item-hover-fg)]",
                            "data-[state=open]:border-[var(--sidebar-item-active-border)] data-[state=open]:bg-[var(--sidebar-item-active-bg)] data-[state=open]:text-[var(--sidebar-item-active-fg)]",
                          )}
                        >
                          <MedusaCirclePlusIcon className="h-4 w-4" />
                          <span className="truncate text-[14px] font-medium">Create</span>
                        </SidebarMenuButton>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="start"
                        side={isCollapsed ? "right" : isMobile ? "bottom" : "right"}
                        className="w-[min(22rem,calc(100vw-1rem))] rounded-2xl border border-[var(--edge-default)] bg-[var(--surface-base)] p-0 shadow-[var(--elevation-3)]"
                      >
                        <div className="max-h-80 overflow-y-auto py-1">
                          {quickActions.length === 0 ? (
                            <p className="px-4 py-3 text-sm text-[var(--sidebar-item-fg-muted)]">No actions available.</p>
                          ) : (
                            quickActions.map((quickAction) => {
                              const quickActionActive = matchesNavHref(quickAction.href, pathname, view);
                              return (
                                <DropdownMenuItem
                                  asChild
                                  key={quickAction.href}
                                  className="px-4 py-2.5 text-[14px]"
                                >
                                  <Link
                                    href={quickAction.href}
                                    className={
                                      quickActionActive
                                        ? "bg-[var(--sidebar-item-active-bg)] text-[var(--sidebar-item-active-fg)]"
                                        : "text-[var(--sidebar-item-fg)]"
                                    }
                                  >
                                    <quickAction.icon className="h-4 w-4" />
                                    <span>{quickAction.label}</span>
                                  </Link>
                                </DropdownMenuItem>
                              );
                            })
                          )}
                        </div>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </SidebarMenuItem>
                ) : null}
              </React.Fragment>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
