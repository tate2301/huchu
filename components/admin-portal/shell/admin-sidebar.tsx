"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, Clock3, Sparkles } from "lucide-react";
import { CompanyWorkspace } from "@/components/admin-portal/types";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { getCompanyNav, PLATFORM_NAV } from "./admin-config";
import { useAdminShell } from "./admin-shell-context";

export function AdminSidebar({
  activeCompanyId,
}: {
  companies: CompanyWorkspace[];
  activeCompanyId?: string;
}) {
  const pathname = usePathname();
  const normalizedPath = pathname.replace(/^\/portal/, "");
  const { activeCompany, recentCompanies } = useAdminShell();
  const nav = activeCompanyId ? getCompanyNav(activeCompanyId) : PLATFORM_NAV;

  return (
    <aside className="w-full xl:sticky xl:top-[6.25rem] xl:w-[18rem] xl:self-start">
      <div className="space-y-4 rounded-[1.75rem] border border-[var(--border)] bg-[rgba(255,255,255,0.78)] p-4 shadow-[var(--elevation-2)] backdrop-blur">
        <section className="rounded-[1.5rem] border border-[var(--border)] bg-[var(--surface-base)] p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">
                Active scope
              </p>
              <p className="text-base font-semibold text-[var(--text-strong)]">
                {activeCompany?.name ?? "Platform"}
              </p>
              <p className="text-xs text-[var(--text-muted)]">
                {activeCompany ? activeCompany.slug ?? activeCompany.id : "Cross-workspace control plane"}
              </p>
            </div>
            <Badge variant="secondary" className="rounded-full px-3 py-1">
              {activeCompanyId ? "Workspace" : "Platform"}
            </Badge>
          </div>
          <div className="mt-4 rounded-2xl border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-3 text-sm text-[var(--text-muted)]">
            {activeCompanyId
              ? "Scoped views keep support, identity, commercial, and reliability actions tied to the selected workspace."
              : "Start from live operator queues, then jump into the right workspace when you need deeper action."}
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">Navigation</p>
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
                (activeCompanyId
                  ? normalizedPath.startsWith(`/admin/clients/${activeCompanyId}`) &&
                    item.href.includes(`/admin/clients/${activeCompanyId}`)
                  : false);
              const Icon = item.icon;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "block rounded-2xl border px-3 py-3 transition-all duration-[160ms]",
                    isActive
                      ? "border-[var(--border)] bg-[var(--surface-muted)] shadow-[inset_0_0_0_1px_var(--border)]"
                      : "border-transparent hover:border-[var(--border)] hover:bg-[var(--surface-muted)]",
                  )}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <div
                        className={cn(
                          "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border",
                          isActive
                            ? "border-[var(--border)] bg-[var(--surface-base)] text-[var(--text-strong)]"
                            : "border-[var(--border)] bg-[var(--surface-base)] text-[var(--text-muted)]",
                        )}
                      >
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <p className={cn("truncate text-sm font-semibold", isActive ? "text-[var(--text-strong)]" : "text-[var(--text-body)]")}>
                          {item.label}
                        </p>
                        {item.description ? <p className="truncate text-xs text-[var(--text-muted)]">{item.description}</p> : null}
                      </div>
                    </div>
                    <ChevronRight className={cn("h-4 w-4 shrink-0", isActive ? "text-[var(--text-strong)]" : "text-[var(--text-muted)]")} />
                  </div>
                </Link>
              );
            })}
          </nav>
        </section>

        {recentCompanies.length > 0 ? (
          <section className="rounded-[1.5rem] border border-[var(--border)] bg-[var(--surface-base)] p-3">
            <div className="mb-3 flex items-center gap-2">
              <Clock3 className="h-4 w-4 text-[var(--text-muted)]" />
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">Recent workspaces</p>
            </div>
            <div className="space-y-2">
              {recentCompanies.slice(0, 4).map((company) => (
                <Link
                  key={company.id}
                  href={`/admin/clients/${company.id}`}
                  className="flex items-center justify-between rounded-2xl border border-transparent px-3 py-2.5 transition-colors hover:border-[var(--border)] hover:bg-[var(--surface-muted)]"
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

        <div className="flex items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--surface-base)] px-3 py-3 text-sm text-[var(--text-muted)]">
          <Sparkles className="h-4 w-4 shrink-0" />
          Guided actions stay in the page header and command bar. Raw tools are intentionally out of the main portal path.
        </div>
      </div>
    </aside>
  );
}
