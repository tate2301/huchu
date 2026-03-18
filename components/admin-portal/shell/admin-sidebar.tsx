"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Clock3 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { getCompanyNav, PLATFORM_NAV } from "./admin-config";
import { useAdminShell } from "./admin-shell-context";

export function AdminSidebar({
  activeCompanyId,
}: {
  activeCompanyId?: string;
}) {
  const pathname = usePathname();
  const normalizedPath = pathname.replace(/^\/portal/, "");
  const { activeCompany, recentCompanies } = useAdminShell();
  const nav = activeCompanyId ? getCompanyNav(activeCompanyId) : PLATFORM_NAV;

  return (
    <aside className="w-full xl:sticky xl:top-6 xl:h-[calc(100vh-3rem)] xl:w-[18rem] xl:self-start">
      <div className="flex h-full flex-col overflow-hidden rounded-[1.75rem] border border-[var(--border)] bg-[rgba(255,255,255,0.78)] shadow-none backdrop-blur">
        <section className="border-b border-[var(--border)] px-4 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">Active scope</p>
              <p className="text-base font-semibold text-[var(--text-strong)]">{activeCompany?.name ?? "Platform"}</p>
              <p className="text-xs text-[var(--text-muted)]">{activeCompany ? activeCompany.slug ?? activeCompany.id : "Cross-workspace control plane"}</p>
            </div>
            <Badge variant="secondary" className="rounded-full px-3 py-1">
              {activeCompanyId ? "Workspace" : "Platform"}
            </Badge>
          </div>
        </section>

        <div className="flex-1 overflow-y-auto px-3 py-3">
          <section className="space-y-3">
            <div className="flex items-center justify-between px-1">
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
                  <div className="flex items-center gap-3">
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
                    <p className={cn("truncate text-sm font-semibold", isActive ? "text-[var(--text-strong)]" : "text-[var(--text-body)]")}>
                      {item.label}
                    </p>
                  </div>
                </Link>
              );
            })}
            </nav>
          </section>

          {recentCompanies.length > 0 ? (
            <section className="mt-5 rounded-[1.5rem] border border-[var(--border)] bg-[var(--surface-base)] p-3">
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
        </div>
      </div>
    </aside>
  );
}
