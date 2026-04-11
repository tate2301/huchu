"use client";

import Link from "next/link";

import {
  MedusaArrowRightOnRectangleIcon,
  MedusaBuildingsIcon,
  MedusaChevronDownIcon,
  MedusaCogSixToothIcon,
  MedusaIdBadgeIcon,
  type LucideIcon,
} from "@/lib/icons";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";

export function SidebarAccountMenu({
  isCollapsed,
  isMobile,
  workspaceLabel,
  workspaceIcon: WorkspaceIcon,
}: {
  isCollapsed: boolean;
  isMobile: boolean;
  workspaceLabel: string;
  workspaceIcon: LucideIcon;
}) {
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <div className={cn("flex", isCollapsed ? "justify-center" : "items-center")}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <SidebarMenuButton
                tooltip="Workspace"
                className={cn(
                  "h-11 min-w-0 rounded-xl border border-transparent px-2.5 text-[14px] font-semibold text-[var(--sidebar-item-fg)] lg:h-10",
                  "transition-[background-color,color,transform] duration-[var(--motion-duration-fast)] ease-[var(--motion-ease-standard)]",
                  "hover:bg-[var(--sidebar-accent)] hover:text-[var(--sidebar-item-hover-fg)]",
                  "data-[active=true]:border-[var(--sidebar-item-active-border)] data-[active=true]:bg-[var(--sidebar-item-active-bg)] data-[active=true]:text-[var(--sidebar-item-active-fg)]",
                )}
              >
                <div className="inline-flex size-6 shrink-0 items-center justify-center rounded-[8px] bg-[#1b1d23] text-white transition-transform duration-[var(--motion-duration-fast)] ease-[var(--motion-ease-standard)]">
                  <WorkspaceIcon className="h-4 w-4" />
                </div>
                {!isCollapsed ? (
                  <>
                    <span className="truncate">{workspaceLabel}</span>
                    <MedusaChevronDownIcon className="ml-auto h-4 w-4 text-[var(--sidebar-item-icon)]" />
                  </>
                ) : null}
              </SidebarMenuButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              side={isCollapsed ? "right" : isMobile ? "bottom" : "right"}
              className="w-[min(22rem,calc(100vw-1rem))] rounded-2xl border border-[var(--edge-default)] bg-[var(--surface-base)] p-0 shadow-[var(--elevation-3)]"
            >
              <DropdownMenuItem asChild className="px-4 py-2.5 text-[14px]">
                <Link href="/settings/branding">
                  <MedusaCogSixToothIcon className="h-4 w-4" />
                  Preferences
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild className="px-4 py-2.5 text-[14px]">
                <Link href="/management/master-data">
                  <MedusaBuildingsIcon className="h-4 w-4" />
                  Workspace setup
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild className="px-4 py-2.5 text-[14px]">
                <Link href="/management/users">
                  <MedusaIdBadgeIcon className="h-4 w-4" />
                  People & access
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem
                asChild
                className="px-4 py-2.5 text-[14px] text-[var(--action-destructive-bg)] focus:bg-[var(--status-error-bg)] focus:text-[var(--action-destructive-bg)]"
              >
                <Link href="/api/auth/signout" className="text-[var(--action-destructive-bg)]">
                  <MedusaArrowRightOnRectangleIcon className="h-4 w-4" />
                  Sign out
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
