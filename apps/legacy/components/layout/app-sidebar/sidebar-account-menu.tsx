"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { Avatar } from "@corelithzw/react";

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
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

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
  const { setOpenMobile } = useSidebar();
  const { data: session } = useSession();
  const user = session?.user;
  const closeMobileNav = () => {
    if (isMobile) setOpenMobile(false);
  };
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <div className={cn("flex", isCollapsed ? "justify-center" : "items-center")}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <SidebarMenuButton
                tooltip="Workspace"
                className="h-11 min-w-0 px-2.5 font-semibold text-[var(--sidebar-item-fg)] lg:h-10"
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
              {/* The switcher recipe leads with who you are and where you
                  are, because acting in the wrong workspace as the wrong
                  person is the mistake it exists to prevent. This platform
                  puts a user in exactly one company — there is no second
                  workspace to offer — so the block identifies rather than
                  switches. */}
              <div className="flex items-center gap-3 border-b border-[var(--edge-default)] px-4 py-3">
                <Avatar size="sm" name={user?.name ?? user?.email ?? "?"} />
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-medium">
                    {user?.name ?? user?.email ?? "Signed in"}
                  </p>
                  <p className="truncate text-sm text-[var(--text-muted)]">
                    {workspaceLabel}
                    {user?.role ? ` · ${String(user.role).toLowerCase().replace(/_/g, " ")}` : ""}
                  </p>
                </div>
              </div>

              <DropdownMenuItem asChild className="px-4 py-2.5 text-[14px]">
                <Link href="/preferences" onClick={closeMobileNav}>
                  <MedusaCogSixToothIcon className="h-4 w-4" />
                  Preferences
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild className="px-4 py-2.5 text-[14px]">
                <Link href="/management/master-data" onClick={closeMobileNav}>
                  <MedusaBuildingsIcon className="h-4 w-4" />
                  Workspace setup
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild className="px-4 py-2.5 text-[14px]">
                <Link href="/preferences/organization/users" onClick={closeMobileNav}>
                  <MedusaIdBadgeIcon className="h-4 w-4" />
                  People & access
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem
                asChild
                className="px-4 py-2.5 text-[14px] text-[var(--action-destructive-bg)] focus:bg-[var(--status-error-bg)] focus:text-[var(--action-destructive-bg)]"
              >
                <Link href="/api/auth/signout" onClick={closeMobileNav} className="text-[var(--action-destructive-bg)]">
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
