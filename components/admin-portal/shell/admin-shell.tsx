"use client";

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
      <div className="mx-auto grid min-h-screen w-full max-w-[1680px] gap-6 px-4 py-6 md:px-6 xl:grid-cols-[18rem_minmax(0,1fr)] xl:items-start">
        <AdminSidebar activeCompanyId={activeCompanyId} />
        <div className="min-w-0">
          <header className="mb-6 rounded-[1.75rem] border border-[var(--border)] bg-[rgba(255,255,255,0.78)] p-4 shadow-none backdrop-blur md:p-5">
            <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
              <div className="min-w-0 flex-1 space-y-4">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="rounded-full px-3 py-1">
                      {activeScope === "platform" ? "Platform control plane" : "Workspace control plane"}
                    </Badge>
                    <Badge variant="secondary" className="rounded-full px-3 py-1">
                      {isLoadingCompanies ? "Loading workspaces" : `${companies.length} workspaces`}
                    </Badge>
                  </div>
                  <div className="space-y-1">
                    <p className="text-base font-semibold text-[var(--text-strong)]">
                      {activeCompany ? activeCompany.name : "Admin Control Plane"}
                    </p>
                    <p className="max-w-3xl text-sm text-[var(--text-muted)]">
                      Production operations workspace for support, identity, reliability, and commercial control.
                    </p>
                  </div>
                  <AdminCommandBarHint />
                </div>

                <div className="grid gap-3 xl:grid-cols-[20rem_minmax(0,1fr)]">
                  <WorkspaceSwitcher activeCompanyId={activeCompanyId} companies={companies} />
                  <AdminCommandBar />
                </div>
              </div>

              <AdminOperatorContext />
            </div>
          </header>

          <main className="min-w-0 pb-10">{children}</main>
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
