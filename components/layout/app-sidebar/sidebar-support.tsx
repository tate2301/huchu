"use client";

import Link from "next/link";

import type { NavItem } from "@/lib/navigation";
import { HelpCircle } from "@/lib/icons";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

import { matchesNavHref } from "./sidebar-helpers";

export function SidebarSupport({
  items,
  pathname,
  view,
  isCollapsed,
  guidedModeEnabled,
  onToggleGuidedMode,
}: {
  items: NavItem[];
  pathname: string;
  view: string | null;
  isCollapsed: boolean;
  guidedModeEnabled: boolean;
  onToggleGuidedMode: () => void;
}) {
  if (items.length === 0) return null;

  return (
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
              className="h-8 text-[12.5px]"
              onClick={onToggleGuidedMode}
            >
              <HelpCircle className="h-4 w-4" />
              <span>Guided Tips</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          {items.map((item) => {
            const isActive = matchesNavHref(item.href, pathname, view);
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
}
