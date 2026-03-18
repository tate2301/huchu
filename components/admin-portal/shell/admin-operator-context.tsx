"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";
import { ChevronDown, LogOut, Settings2 } from "lucide-react";
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
        <Button variant="outline" className="h-10 min-w-0 justify-between rounded-xl border-[var(--border)] bg-[var(--surface-base)] px-2.5 shadow-none">
          <span className="flex min-w-0 items-center gap-2.5 text-left">
            <Avatar className="border border-[var(--border)] bg-[var(--surface-muted)]">
              <AvatarFallback>{initials(actorLabel)}</AvatarFallback>
            </Avatar>
            <span className="max-w-[10rem] truncate text-sm font-semibold text-[var(--text-strong)]">{actorLabel}</span>
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel>
          <div>
            <p className="truncate text-sm font-semibold">{actorLabel}</p>
            <p className="truncate text-xs text-[var(--text-muted)]">{roleLabel}</p>
            <p className="truncate text-xs text-[var(--text-muted)]">{actorEmail}</p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/admin/settings">
            <Settings2 className="h-4 w-4" />
            Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void signOut({ callbackUrl: "/admin/login" })}>
          <LogOut className="h-4 w-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
