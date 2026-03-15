"use client";

import { BellRing } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { AdminCommandBar, AdminCommandBarHint } from "./admin-command-bar";
import { AdminOperatorContext } from "./admin-operator-context";
import { AdminSidebar } from "./admin-sidebar";
import { AdminShellProvider, useAdminShell } from "./admin-shell-context";

function AdminShellFrame({
  activeCompanyId,
  children,
}: {
  activeCompanyId?: string;
  children: React.ReactNode;
}) {
  const { companies, activeCompany, activeScope, isLoadingCompanies } = useAdminShell();

  return (
    <div className="min-h-screen bg-[var(--surface-canvas)] text-[var(--text-strong)]">
      <div className="mx-auto flex min-h-screen w-full max-w-[1600px] flex-col gap-4 px-4 py-4 md:px-6 md:py-6">
        <header className="rounded-[28px] border border-[var(--border)] bg-[linear-gradient(135deg,var(--surface-base),var(--surface-muted))] px-5 py-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="rounded-full px-3 py-1">
                  {activeScope === "platform" ? "Platform control plane" : "Organization control plane"}
                </Badge>
                <Badge variant="secondary" className="rounded-full px-3 py-1">
                  {isLoadingCompanies ? "Loading workspaces" : `${companies.length} workspaces`}
                </Badge>
              </div>
              <div>
                <h1 className="text-3xl font-semibold tracking-tight">
                  {activeCompany ? activeCompany.name : "Admin Control Plane"}
                </h1>
                <p className="max-w-3xl text-sm text-[var(--text-muted)]">
                  Stripe-style operational cockpit with Clerk-inspired workspace switching, quick search, and guided actions for high-confidence platform operations.
                </p>
              </div>
              <AdminCommandBarHint />
            </div>

            <div className="flex flex-col gap-3 xl:items-end">
              <AdminCommandBar />
              <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                <BellRing className="h-4 w-4" />
                <span>Global search supports clients, users, actions, incidents, and quick jumps.</span>
              </div>
            </div>
          </div>
        </header>

        <AdminOperatorContext />

        <div className="flex min-h-0 flex-1 flex-col gap-4 xl:flex-row">
          <AdminSidebar companies={companies} activeCompanyId={activeCompanyId} />
          <main className="min-w-0 flex-1 space-y-4">{children}</main>
        </div>
      </div>
    </div>
  );
}

export function AdminShell({
  activeCompanyId,
  children,
}: {
  activeCompanyId?: string;
  children: React.ReactNode;
}) {
  return (
    <AdminShellProvider activeCompanyId={activeCompanyId}>
      <AdminShellFrame activeCompanyId={activeCompanyId}>{children}</AdminShellFrame>
    </AdminShellProvider>
  );
}
