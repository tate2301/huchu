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
        <Button variant="ghost" className="h-9 min-w-0 gap-2 rounded-xl bg-[var(--surface-muted)] px-2.5 text-[var(--text-strong)] shadow-none hover:bg-[rgba(255,255,255,0.82)]">
          <span className="flex min-w-0 items-center gap-2 text-left">
            <Avatar className="h-6 w-6 bg-[rgba(255,255,255,0.88)]">
              <AvatarFallback>{initials(actorLabel)}</AvatarFallback>
            </Avatar>
            <span className="max-w-[9rem] truncate text-[13px] font-medium text-[var(--text-strong)]">{actorLabel}</span>
          </span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" />
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
