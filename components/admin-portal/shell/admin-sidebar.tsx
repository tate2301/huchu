"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { CompanyWorkspace } from "@/components/admin-portal/types";
import { cn } from "@/lib/utils";
import { getCompanyNav, PLATFORM_NAV } from "./admin-config";
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
  const nav = activeCompanyId ? getCompanyNav(activeCompanyId) : PLATFORM_NAV;

  return (
    <aside className="flex h-full w-full flex-col border-r border-[var(--edge-subtle)] bg-[linear-gradient(180deg,var(--surface-base)_0%,var(--surface-subtle)_100%)]">
      <div className="flex h-full flex-col overflow-hidden">
        <div className="px-3 pb-2 pt-3">
          <WorkspaceSwitcher
            activeCompanyId={activeCompanyId}
            companies={companies}
          />
        </div>

        <div className="px-4 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
          Navigation
        </div>

        <div className="flex-1 overflow-y-auto px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-1">
          <nav className="space-y-2">
            {nav.map((item) => {
              const targetPath = item.href.replace(/#.*/, "");
              const isActive =
                normalizedPath === item.href ||
                normalizedPath === targetPath ||
                normalizedPath.startsWith(`${targetPath}/`) ||
                (activeCompanyId
                  ? normalizedPath.startsWith(
                      `/admin/clients/${activeCompanyId}`,
                    ) && item.href.includes(`/admin/clients/${activeCompanyId}`)
                  : false);
              const Icon = item.icon;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  className={cn(
                    "group flex min-h-11 items-center gap-3 rounded-[10px] px-3 py-2 transition-[background-color,color,transform,box-shadow] duration-[var(--motion-duration-fast)] ease-[var(--motion-ease-standard)] lg:min-h-10",
                    isActive
                      ? "bg-[var(--action-secondary-bg)] text-[var(--text-strong)] shadow-[inset_0_0_0_1px_var(--edge-default)]"
                      : "text-[var(--text-muted)] hover:translate-x-[1px] hover:bg-[var(--surface-subtle)]",
                  )}
                >
                  <div
                    className={cn(
                      "flex shrink-0 items-center justify-center rounded-[10px] border border-transparent transition-colors duration-[var(--motion-duration-fast)] ease-[var(--motion-ease-standard)]",
                      isActive
                        ? "text-[var(--action-primary-bg)]"
                        : "text-[var(--text-muted)]",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p
                      className={cn(
                        "truncate text-[14px] font-medium",
                        isActive
                          ? "text-[var(--text-strong)]"
                          : "text-[var(--text-body)]",
                      )}
                    >
                      {item.label}
                    </p>
                  </div>
                </Link>
              );
            })}
          </nav>
        </div>
      </div>
    </aside>
  );
}
