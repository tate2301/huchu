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
  onNavigate,
}: {
  activeCompanyId?: string;
  companies: CompanyWorkspace[];
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const normalizedPath = pathname.replace(/^\/portal/, "");
  const { recentCompanies } = useAdminShell();
  const nav = activeCompanyId ? getCompanyNav(activeCompanyId) : PLATFORM_NAV;

  return (
    <aside className="flex h-full w-full flex-col border-r border-[var(--sidebar-border)] bg-[var(--sidebar)]">
      <div className="flex h-full flex-col overflow-hidden">
        <div className="border-b border-[var(--edge-subtle)] px-3 pb-3 pt-4">
          <WorkspaceSwitcher activeCompanyId={activeCompanyId} companies={companies} />
        </div>

        <div className="flex-1 overflow-y-auto px-3 pb-4 pt-4">
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
                  onClick={onNavigate}
                  className={cn(
                    "group flex items-center gap-3 rounded-[10px] px-3 py-2.5 transition-all duration-[160ms]",
                    isActive
                      ? "bg-[var(--sidebar-accent)] text-[var(--text-strong)]"
                      : "text-[var(--text-body)] hover:bg-[rgba(255,255,255,0.4)]",
                  )}
                >
                  <div
                    className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] border border-transparent",
                      isActive
                        ? "bg-[rgba(255,255,255,0.82)] text-[var(--text-strong)]"
                        : "bg-transparent text-[var(--text-muted)]",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className={cn("truncate text-[14px] font-medium", isActive ? "text-[var(--text-strong)]" : "text-[var(--text-body)]")}>
                      {item.label}
                    </p>
                    <p className="truncate text-[11px] text-[var(--text-muted)]">
                      {item.description}
                    </p>
                  </div>
                </Link>
              );
            })}
          </nav>

          {recentCompanies.length > 0 ? (
            <section className="mt-6 border-t border-[var(--edge-subtle)] pt-4">
              <div className="mb-2 flex items-center gap-2 px-1">
                <Clock3 className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Recent</p>
              </div>
              <div className="space-y-1">
                {recentCompanies.slice(0, 4).map((company) => (
                  <Link
                    key={company.id}
                    href={`/admin/clients/${company.id}`}
                    onClick={onNavigate}
                    className="flex items-center justify-between gap-2 rounded-xl px-3 py-2.5 transition-colors hover:bg-[rgba(255,255,255,0.56)]"
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
