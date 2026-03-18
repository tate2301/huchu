"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";
import { Fingerprint, LogOut, Settings2, ShieldCheck } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
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
  const { activeCompany, activeScope, actorEmail, actorLabel, roleLabel, supportState, isLoadingSupportState } = useAdminShell();
  const activeSession = supportState.activeSession;
  const pendingRequestCount = supportState.actorPendingRequests.length;
  const accessModeLabel = activeSession ? activeSession.mode : pendingRequestCount > 0 ? "Pending request" : "Direct operator";
  const accessModeDetail = activeSession
    ? `${activeSession.scope} until ${activeSession.expiresAt ? new Date(activeSession.expiresAt).toLocaleString() : "manual end"}`
    : pendingRequestCount > 0
      ? `${pendingRequestCount} request${pendingRequestCount === 1 ? "" : "s"} awaiting approval`
      : activeScope === "platform"
        ? "Platform control plane"
        : activeCompany?.name ?? "Workspace scope";
  const accessModeBadge = activeSession ? "Active session" : pendingRequestCount > 0 ? "Pending" : activeScope === "platform" ? "Platform" : "Workspace";

  return (
    <div className="flex flex-col items-stretch gap-3 xl:items-end">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <div className="flex min-w-[17rem] items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface-base)] px-3 py-2.5">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-2 text-[var(--text-muted)]">
            <Fingerprint className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Access mode</p>
            <p className="truncate text-sm font-semibold text-[var(--text-strong)]">{isLoadingSupportState ? "Loading support state" : accessModeLabel}</p>
            <p className="truncate text-xs text-[var(--text-muted)]">{isLoadingSupportState ? "Checking live support state" : accessModeDetail}</p>
          </div>
          <Badge variant="secondary" className="rounded-full px-3 py-1 font-medium">
            {accessModeBadge}
          </Badge>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="h-12 min-w-[15rem] justify-between rounded-2xl border-[var(--border)] bg-[var(--surface-base)] px-3 shadow-none">
              <span className="flex min-w-0 items-center gap-3 text-left">
                <Avatar size="lg" className="border border-[var(--border)] bg-[var(--surface-muted)]">
                  <AvatarFallback>{initials(actorLabel)}</AvatarFallback>
                </Avatar>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-[var(--text-strong)]">{actorLabel}</span>
                  <span className="block truncate text-xs text-[var(--text-muted)]">{roleLabel}</span>
                </span>
              </span>
              <ShieldCheck className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-72">
            <DropdownMenuLabel>
              <div>
                <p className="truncate text-sm font-semibold">{actorLabel}</p>
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
      </div>
    </div>
  );
}
