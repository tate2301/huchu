"use client";

import Link from "next/link";

import type { NavItem } from "@/lib/navigation";
import { Circle, HelpCircle } from "@/lib/icons";
import { cn } from "@/lib/utils";
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
  return (
    <SidebarGroup className="mt-auto pb-1">
      {!isCollapsed ? (
        <SidebarGroupLabel className="px-2 pb-1 text-[12px] font-medium normal-case tracking-normal text-muted-foreground">
          Help
        </SidebarGroupLabel>
      ) : null}
      <SidebarGroupContent className="mt-0.5">
        {items.length > 0 ? (
          <SidebarMenu className="gap-0">
            {items.map((item) => {
              const isActive = matchesNavHref(item.href, pathname, view);
              return (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    size="sm"
                    isActive={isActive}
                    tooltip={item.label}
                    className="h-[34px] rounded-[10px] border border-transparent px-2.5 text-[14px] font-medium data-[active=true]:border-transparent data-[active=true]:bg-[var(--surface-muted)] data-[active=true]:shadow-none"
                  >
                    <Link href={item.href}>
                      <item.icon className="h-4 w-4 text-muted-foreground" />
                      <span>{item.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        ) : null}

        <div className={cn("mt-2 flex items-center justify-between px-1", isCollapsed ? "justify-center" : "")}>
          <button
            type="button"
            className={cn(
              "inline-flex size-8 items-center justify-center rounded-full border transition-colors",
              guidedModeEnabled
                ? "border-[var(--action-primary-bg)] bg-[var(--action-secondary-bg)] text-[var(--action-primary-bg)]"
                : "border-[var(--edge-default)] bg-[var(--surface-base)] text-muted-foreground hover:bg-[var(--surface-subtle)]",
            )}
            onClick={onToggleGuidedMode}
            aria-label={guidedModeEnabled ? "Disable guided tips" : "Enable guided tips"}
          >
            {guidedModeEnabled ? <HelpCircle className="h-4 w-4" /> : <Circle className="h-4 w-4" />}
          </button>
          {!isCollapsed ? (
            <span className="inline-flex items-center rounded-full border border-[var(--edge-default)] bg-[var(--surface-base)] px-3 py-1 text-[12px] font-medium text-[var(--text-body)]">
              Free plan
            </span>
          ) : null}
        </div>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
