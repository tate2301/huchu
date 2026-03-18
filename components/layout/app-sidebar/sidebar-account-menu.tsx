"use client";

import Link from "next/link";

import { ChevronDown, HelpCircle, LogOut, User } from "@/lib/icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";

import { getInitials } from "./sidebar-helpers";

type SessionLike = {
  user?: {
    name?: string | null;
    role?: string | null;
  } | null;
} | null | undefined;

export function SidebarAccountMenu({
  session,
  isCollapsed,
  isMobile,
}: {
  session: SessionLike;
  isCollapsed: boolean;
  isMobile: boolean;
}) {
  if (!session) {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton asChild size="lg" tooltip="Login">
            <Link href="/login">
              <div className="bg-sidebar-accent text-sidebar-accent-foreground flex aspect-square size-8 items-center justify-center rounded-lg">
                <User className="h-4 w-4" />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">Login</span>
                <span className="truncate text-sm text-muted-foreground">Access account</span>
              </div>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    );
  }

  return (
    <div className={!isCollapsed ? "w-64" : ""}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <SidebarMenuButton
            tooltip="Account"
            className="h-10 rounded-lg !p-2 hover:bg-muted"
          >
            <div className="bg-primary/10 text-primary flex size-8 items-center justify-center rounded-md text-xs font-semibold shadow-[var(--surface-frame-shadow)]">
              {getInitials(session.user?.name)}
            </div>
            <div className="min-w-0">
              <p className="truncate text-[13px] font-semibold text-foreground">
                {session.user?.name ?? "User"}
              </p>
            </div>
            {!isCollapsed ? (
              <ChevronDown className="ml-auto h-4 w-4 text-muted-foreground" />
            ) : null}
          </SidebarMenuButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          side={isCollapsed ? "right" : isMobile ? "bottom" : "top"}
          className="w-64 rounded-xl border-0 shadow-[var(--elevation-3)]"
        >
          <DropdownMenuLabel>Account</DropdownMenuLabel>
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
            {session.user?.role ?? "User"}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href="/help">
              <HelpCircle className="h-4 w-4" />
              Quick Tips
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/api/auth/signout">
              <LogOut className="h-4 w-4" />
              Sign Out
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
