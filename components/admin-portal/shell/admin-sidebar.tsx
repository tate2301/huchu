"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Clock3 } from "lucide-react";
import type { CompanyWorkspace } from "@/components/admin-portal/types";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { getCompanyNav, PLATFORM_NAV } from "./admin-config";
import { useAdminShell } from "./admin-shell-context";
import { WorkspaceSwitcher } from "./workspace-switcher";

export function AdminSidebar({
  activeCompanyId,
  companies,
}: {
  activeCompanyId?: string;
  companies: CompanyWorkspace[];
}) {
  const pathname = usePathname();
  const normalizedPath = pathname.replace(/^\/portal/, "");
  const { recentCompanies } = useAdminShell();
  const nav = activeCompanyId ? getCompanyNav(activeCompanyId) : PLATFORM_NAV;

  return (
    <aside className="w-full bg-[var(--sidebar)]/98 shadow-none xl:sticky xl:top-0 xl:h-screen xl:w-[15rem] xl:border-r xl:border-[var(--sidebar-border)]">
      <div className="flex h-full flex-col overflow-hidden">
        <div className="px-3 pb-3 pt-3">
          <WorkspaceSwitcher activeCompanyId={activeCompanyId} companies={companies} />
        </div>

        <div className="flex-1 overflow-y-auto px-3 pb-4">
          <nav className="space-y-1">
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
                    "block rounded-[12px] px-2.5 py-2 transition-all duration-[160ms]",
                    isActive
                      ? "bg-[rgba(79,70,229,0.12)] text-[var(--text-strong)] shadow-[0_0_0_1px_rgba(79,70,229,0.18)]"
                      : "text-[var(--text-body)] hover:bg-[var(--surface-muted)]",
                  )}
                >
                  <div className="flex items-center gap-2.5">
                    <div
                      className={cn(
                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-transparent",
                        isActive
                          ? "bg-[rgba(79,70,229,0.14)] text-[var(--text-strong)] border-[rgba(79,70,229,0.18)]"
                          : "bg-[var(--surface-muted)] text-[var(--text-muted)]",
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
                    </div>
                    <p className={cn("truncate text-[13px] font-semibold", isActive ? "text-[var(--text-strong)]" : "text-[var(--text-body)]")}>
                      {item.label}
                    </p>
                  </div>
                </Link>
              );
            })}
          </nav>

          {recentCompanies.length > 0 ? (
            <section className="mt-4 pt-3">
              <div className="mb-2 flex items-center gap-2 px-2">
                <Clock3 className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Recent</p>
              </div>
              <div className="space-y-1">
                {recentCompanies.slice(0, 4).map((company) => (
                  <Link
                    key={company.id}
                    href={`/admin/clients/${company.id}`}
                    className="flex items-center justify-between gap-2 rounded-[12px] px-2.5 py-2 transition-colors hover:bg-[var(--surface-muted)]"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-medium text-[var(--text-strong)]">{company.name}</p>
                      <p className="truncate text-[11px] text-[var(--text-muted)]">{company.slug ?? company.id}</p>
                    </div>
                    {company.status ? <Badge variant="secondary" className="rounded-full px-2 py-0 text-[10px]">{company.status}</Badge> : null}
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
