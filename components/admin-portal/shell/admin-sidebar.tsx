"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight, Clock3 } from "lucide-react";
import { CompanyWorkspace } from "@/components/admin-portal/types";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { getCompanyNav, PLATFORM_NAV } from "./admin-config";
import { useAdminShell } from "./admin-shell-context";
import { WorkspaceSwitcher } from "./workspace-switcher";

export function AdminSidebar({
  companies,
  activeCompanyId,
}: {
  companies: CompanyWorkspace[];
  activeCompanyId?: string;
}) {
  const pathname = usePathname();
  const normalizedPath = pathname.replace(/^\/portal/, "");
  const { recentCompanies } = useAdminShell();
  const nav = activeCompanyId ? getCompanyNav(activeCompanyId) : PLATFORM_NAV;

  return (
    <aside className="w-full space-y-4 md:w-[20rem]">
      <WorkspaceSwitcher activeCompanyId={activeCompanyId} companies={companies} />

      <section className="rounded-[22px] border border-[var(--border)] bg-[var(--surface-base)] p-3">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Control plane</p>
          <Badge variant="outline" className="rounded-full px-2.5 py-1">
            {activeCompanyId ? "Scoped" : "Global"}
          </Badge>
        </div>
        <nav className="space-y-1.5">
          {nav.map((item) => {
            const targetPath = item.href.replace(/#.*/, "");
            const isActive =
              normalizedPath === item.href ||
              normalizedPath === targetPath ||
              normalizedPath.startsWith(`${targetPath}/`) ||
              (activeCompanyId ? normalizedPath.startsWith(`/admin/clients/${activeCompanyId}`) && item.href.includes(`/admin/clients/${activeCompanyId}`) : false);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "block rounded-2xl border border-transparent px-3 py-3 transition-colors",
                  isActive
                    ? "border-[var(--border)] bg-[var(--surface-muted)]"
                    : "hover:border-[var(--border)] hover:bg-[var(--surface-muted)]",
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className={cn("text-sm font-semibold", isActive ? "text-[var(--text-strong)]" : "text-[var(--text-body)]")}>
                      {item.label}
                    </p>
                    <p className="mt-1 text-xs text-[var(--text-muted)]">{item.description}</p>
                  </div>
                  <ArrowRight className={cn("mt-0.5 h-4 w-4 shrink-0", isActive ? "text-[var(--text-strong)]" : "text-[var(--text-muted)]")} />
                </div>
              </Link>
            );
          })}
        </nav>
      </section>

      {recentCompanies.length > 0 ? (
        <section className="rounded-[22px] border border-[var(--border)] bg-[var(--surface-base)] p-3">
          <div className="mb-3 flex items-center gap-2">
            <Clock3 className="h-4 w-4 text-[var(--text-muted)]" />
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Recent workspaces</p>
          </div>
          <div className="space-y-2">
            {recentCompanies.slice(0, 4).map((company) => (
              <Link
                key={company.id}
                href={`/admin/clients/${company.id}`}
                className="flex items-center justify-between rounded-2xl border border-transparent px-3 py-2.5 hover:border-[var(--border)] hover:bg-[var(--surface-muted)]"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-[var(--text-strong)]">{company.name}</p>
                  <p className="truncate text-xs text-[var(--text-muted)]">{company.slug ?? company.id}</p>
                </div>
                {company.status ? <Badge variant="outline">{company.status}</Badge> : null}
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </aside>
  );
}
