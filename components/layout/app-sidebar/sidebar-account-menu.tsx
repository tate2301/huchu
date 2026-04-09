"use client";

import Link from "next/link";

import type { NavItem } from "@/lib/navigation";
import {
  Building2,
  ChevronDown,
  Dashboard,
  LogOut,
  ManageAccounts,
  Plus,
} from "@/lib/icons";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";

import { matchesNavHref } from "./sidebar-helpers";

export function SidebarAccountMenu({
  isCollapsed,
  isMobile,
  workspaceLabel,
  quickActions,
  pathname,
  view,
}: {
  isCollapsed: boolean;
  isMobile: boolean;
  workspaceLabel: string;
  quickActions: NavItem[];
  pathname: string;
  view: string | null;
}) {
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <div className={cn("flex gap-1.5", isCollapsed ? "flex-col items-center" : "items-center")}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <SidebarMenuButton
                tooltip="Workspace"
                className="h-10 min-w-0 rounded-xl border border-transparent px-2.5 text-[14px] font-semibold hover:bg-[var(--surface-subtle)] data-[active=true]:border-transparent data-[active=true]:bg-[var(--surface-subtle)]"
              >
                <div className="inline-flex size-6 shrink-0 items-center justify-center rounded-[8px] bg-[#1b1d23] text-white">
                  <Building2 className="h-4 w-4" />
                </div>
                {!isCollapsed ? (
                  <>
                    <span className="truncate">{workspaceLabel}</span>
                    <ChevronDown className="ml-auto h-4 w-4 text-muted-foreground" />
                  </>
                ) : null}
              </SidebarMenuButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              side={isCollapsed ? "right" : isMobile ? "bottom" : "right"}
              className="w-72 rounded-2xl border border-[var(--edge-default)] bg-[var(--surface-base)] p-0 shadow-[var(--elevation-3)]"
            >
              <DropdownMenuItem asChild className="px-4 py-2.5 text-[14px]">
                <Link href="/settings/branding">
                  <Dashboard className="h-4 w-4" />
                  Preferences
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild className="px-4 py-2.5 text-[14px]">
                <Link href="/management/master-data">
                  <ManageAccounts className="h-4 w-4" />
                  Workspace settings
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild className="px-4 py-2.5 text-[14px]">
                <Link href="/management/users">
                  <ManageAccounts className="h-4 w-4" />
                  Invite and manage members
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem
                asChild
                className="px-4 py-2.5 text-[14px] text-[var(--action-destructive-bg)] focus:bg-[var(--status-error-bg)] focus:text-[var(--action-destructive-bg)]"
              >
                <Link href="/api/auth/signout" className="text-[var(--action-destructive-bg)]">
                  <LogOut className="h-4 w-4" />
                  Log out
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="inline-flex size-8 items-center justify-center rounded-full border border-[var(--edge-default)] bg-[var(--surface-base)] text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-subtle)] hover:text-foreground"
                aria-label="Quick actions"
              >
                <Plus className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              side={isCollapsed ? "right" : isMobile ? "bottom" : "right"}
              className="w-72 rounded-2xl border border-[var(--edge-default)] bg-[var(--surface-base)] p-0 shadow-[var(--elevation-3)]"
            >
              <div className="max-h-80 overflow-y-auto py-1">
                {quickActions.length === 0 ? (
                  <p className="px-4 py-3 text-sm text-muted-foreground">No quick actions available.</p>
                ) : (
                  quickActions.map((item) => {
                    const isActive = matchesNavHref(item.href, pathname, view);
                    return (
                      <DropdownMenuItem
                        asChild
                        key={item.href}
                        className="px-4 py-2.5 text-[14px]"
                      >
                        <Link
                          href={item.href}
                          className={isActive ? "bg-[var(--surface-subtle)] text-foreground" : ""}
                        >
                          <item.icon className="h-4 w-4" />
                          <span>{item.label}</span>
                        </Link>
                      </DropdownMenuItem>
                    );
                  })
                )}
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
