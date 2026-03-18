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
    <aside className="w-full border-b border-[var(--border)] bg-[rgba(255,255,255,0.86)] xl:sticky xl:top-0 xl:h-screen xl:w-[18rem] xl:border-b-0 xl:border-r">
      <div className="flex h-full flex-col overflow-hidden">
        <div className="border-b border-[var(--border)] p-4">
          <WorkspaceSwitcher activeCompanyId={activeCompanyId} companies={companies} />
        </div>

        <div className="flex-1 overflow-y-auto p-3">
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
                    "block rounded-xl border px-3 py-3 transition-all duration-[160ms]",
                    isActive
                      ? "border-[var(--border)] bg-[var(--surface-muted)] shadow-[inset_0_0_0_1px_var(--border)]"
                      : "border-transparent hover:border-[var(--border)] hover:bg-[var(--surface-muted)]",
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border",
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

          {recentCompanies.length > 0 ? (
            <section className="mt-5 border-t border-[var(--border)] pt-5">
              <div className="mb-3 flex items-center gap-2 px-2">
                <Clock3 className="h-4 w-4 text-[var(--text-muted)]" />
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">Recent</p>
              </div>
              <div className="space-y-1.5">
                {recentCompanies.slice(0, 4).map((company) => (
                  <Link
                    key={company.id}
                    href={`/admin/clients/${company.id}`}
                    className="flex items-center justify-between rounded-xl border border-transparent px-3 py-2.5 transition-colors hover:border-[var(--border)] hover:bg-[var(--surface-muted)]"
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
