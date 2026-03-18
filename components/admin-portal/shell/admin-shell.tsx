"use client";

import { Shield } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { AdminCommandBar, AdminCommandBarHint } from "./admin-command-bar";
import { AdminOperatorContext } from "./admin-operator-context";
import { AdminSidebar } from "./admin-sidebar";
import { AdminShellProvider, useAdminShell } from "./admin-shell-context";
import { WorkspaceSwitcher } from "./workspace-switcher";

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
      <div className="mx-auto flex min-h-screen w-full max-w-[1680px] flex-col">
        <header className="sticky top-0 z-30 border-b border-[var(--border)] bg-[rgba(252,252,244,0.86)] backdrop-blur">
          <div className="px-4 py-4 md:px-6">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex min-w-0 items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--surface-base)] text-[var(--action-primary-bg)]">
                  <Shield className="h-6 w-6" />
                </div>
                <div className="min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="rounded-full px-3 py-1">
                      {activeScope === "platform" ? "Platform control plane" : "Workspace control plane"}
                    </Badge>
                    <Badge variant="secondary" className="rounded-full px-3 py-1">
                      {isLoadingCompanies ? "Loading workspaces" : `${companies.length} workspaces`}
                    </Badge>
                  </div>
                  <div>
                    <h1 className="truncate text-2xl font-semibold tracking-tight md:text-3xl">
                      {activeCompany ? activeCompany.name : "Admin Control Plane"}
                    </h1>
                    <p className="max-w-3xl text-sm text-[var(--text-muted)]">
                      Production operations workspace for support, identity, reliability, and commercial control.
                    </p>
                  </div>
                  <AdminCommandBarHint />
                </div>
              </div>

              <div className="grid min-w-0 gap-3 xl:w-[58rem] xl:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
                <WorkspaceSwitcher activeCompanyId={activeCompanyId} companies={companies} />
                <AdminCommandBar />
              </div>
            </div>
            <div className="mt-4">
              <AdminOperatorContext />
            </div>
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col gap-6 px-4 py-6 md:px-6 xl:flex-row xl:items-start">
          <AdminSidebar companies={companies} activeCompanyId={activeCompanyId} />
          <main className="min-w-0 flex-1 pb-10">{children}</main>
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
