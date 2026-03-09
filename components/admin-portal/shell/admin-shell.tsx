"use client";

import { useEffect, useState } from "react";
import { AdminCommandBar } from "./admin-command-bar";
import { AdminSidebar } from "./admin-sidebar";
import { CompanyWorkspace } from "@/components/admin-portal/types";
import { fetchCompanies } from "@/components/admin-portal/api";

export function AdminShell({
  activeCompanyId,
  children,
}: {
  activeCompanyId?: string;
  children: React.ReactNode;
}) {
  const [companies, setCompanies] = useState<CompanyWorkspace[]>([]);

  useEffect(() => {
    void fetchCompanies().then(setCompanies).catch(() => setCompanies([]));
  }, []);

  return (
    <div className="min-h-screen bg-[var(--surface-canvas)] p-4 md:p-6">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 md:flex-row">
        <AdminSidebar companies={companies} activeCompanyId={activeCompanyId} />
        <main className="min-w-0 flex-1 space-y-4">
          <AdminCommandBar companies={companies} activeCompanyId={activeCompanyId} />
          {children}
        </main>
      </div>
    </div>
  );
}
