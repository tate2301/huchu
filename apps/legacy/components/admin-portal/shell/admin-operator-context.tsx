"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";
import { ChevronDown, LogOut, Settings2 } from "@/lib/icons";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAdminShell } from "./admin-shell-context";

function initials(value: string) {
  const parts = value.trim().split(/\s+/).slice(0, 2);
  return parts.map((part) => part.charAt(0).toUpperCase()).join("") || "SU";
}

export function AdminOperatorContext() {
  const { actorEmail, actorLabel, roleLabel } = useAdminShell();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="h-8 min-w-0 gap-2 !rounded-full p-0 text-[var(--text-strong)]"
        >
          <span className="flex min-w-0 items-center gap-2 text-left">
            <Avatar className="h-8 w-8 bg-[var(--surface-muted)]">
              <AvatarFallback>{initials(actorLabel)}</AvatarFallback>
            </Avatar>
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel>
          <div>
            <p className="truncate text-sm font-semibold">{actorLabel}</p>

            <p className="truncate text-xs text-[var(--text-muted)]">
              {actorEmail}
            </p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuItem asChild>
          <Link href="/admin/settings" className="text-[var(--text-muted)]">
            <Settings2 className="h-4 w-4" />
            Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => void signOut({ callbackUrl: "/admin/login" })}
          className="!text-destructive"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
