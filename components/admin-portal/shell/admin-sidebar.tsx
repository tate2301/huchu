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
    <aside className="w-full bg-[var(--sidebar-bg)] border-r border-[var(--border-default)] xl:sticky xl:top-0 xl:h-screen xl:w-[15rem]">
      <div className="flex h-full flex-col overflow-hidden">
        <div className="px-3 pb-2 pt-3">
          <WorkspaceSwitcher activeCompanyId={activeCompanyId} companies={companies} />
        </div>

        <div className="flex-1 overflow-y-auto px-3 pb-3">
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
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-[var(--motion-duration-fast)]",
                    isActive
                      ? "bg-[var(--sidebar-item-active)] text-[var(--primary)]"
                      : "text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]",
                  )}
                >
                  <Icon className={cn(
                    "h-4 w-4 shrink-0",
                    isActive ? "text-[var(--primary)]" : "text-[var(--text-muted)]"
                  )} />
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            })}
          </nav>

          {recentCompanies.length > 0 ? (
            <section className="mt-6 pt-4 border-t border-[var(--border-subtle)]">
              <div className="mb-2 flex items-center gap-2 px-3">
                <Clock3 className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Recent</p>
              </div>
              <div className="space-y-1">
                {recentCompanies.slice(0, 4).map((company) => (
                  <Link
                    key={company.id}
                    href={`/admin/clients/${company.id}`}
                    className="flex items-center justify-between gap-2 rounded-lg px-3 py-2 transition-colors hover:bg-[var(--surface-hover)]"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-[var(--text-strong)]">{company.name}</p>
                      <p className="truncate text-xs text-[var(--text-muted)]">{company.slug ?? company.id}</p>
                    </div>
                    {company.status ? <Badge variant="secondary" className="text-xs">{company.status}</Badge> : null}
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
