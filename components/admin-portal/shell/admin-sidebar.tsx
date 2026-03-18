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
    <aside className="w-full bg-[rgba(255,255,255,0.78)] shadow-[0_1px_0_rgba(28,34,43,0.06)] xl:sticky xl:top-0 xl:h-screen xl:w-[15rem] xl:shadow-[1px_0_0_rgba(28,34,43,0.06)]">
      <div className="flex h-full flex-col overflow-hidden">
        <div className="px-2.5 pb-2 pt-2.5">
          <WorkspaceSwitcher activeCompanyId={activeCompanyId} companies={companies} />
        </div>

        <div className="flex-1 overflow-y-auto px-2.5 pb-3">
          <nav className="space-y-0.5">
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
                    "block rounded-xl px-2.5 py-2 transition-all duration-[160ms]",
                    isActive
                      ? "bg-[var(--surface-muted)] text-[var(--text-strong)]"
                      : "text-[var(--text-body)] hover:bg-[rgba(255,255,255,0.72)]",
                  )}
                >
                  <div className="flex items-center gap-2.5">
                    <div
                      className={cn(
                        "flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
                        isActive
                          ? "bg-[var(--surface-base)] text-[var(--text-strong)]"
                          : "bg-transparent text-[var(--text-muted)]",
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" />
                    </div>
                    <p className={cn("truncate text-[13px] font-medium", isActive ? "text-[var(--text-strong)]" : "text-[var(--text-body)]")}>
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
              <div className="space-y-0.5">
                {recentCompanies.slice(0, 4).map((company) => (
                  <Link
                    key={company.id}
                    href={`/admin/clients/${company.id}`}
                    className="flex items-center justify-between gap-2 rounded-xl px-2.5 py-2 transition-colors hover:bg-[rgba(255,255,255,0.72)]"
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
