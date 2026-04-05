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
    <aside className="flex h-full w-full flex-col bg-[var(--sidebar)]">
      <div className="flex h-full flex-col overflow-hidden">
        <div className="px-3 pb-3 pt-4">
          <WorkspaceSwitcher
            activeCompanyId={activeCompanyId}
            companies={companies}
          />
        </div>

        <div className="flex-1 overflow-y-auto px-3 pb-4 pt-4">
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
                    "group flex items-center gap-3 rounded-[10px] px-3 py-1.5  transition-all duration-[160ms]",
                    isActive
                      ? "bg-[var(--surface-base)] shadow-sm"
                      : "text-muted hover:bg-[rgba(255,255,255,0.4)]",
                  )}
                >
                  <div
                    className={cn(
                      "flex  shrink-0 items-center justify-center rounded-[10px] border border-transparent",
                      isActive
                        ? "text-[var(--text-strong)] "
                        : "text-[var(--text-muted)]",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p
                      className={cn(
                        "truncate text-sm font-semibold",
                        isActive
                          ? "text-[var(--text-strong)] "
                          : "text-[var(--text-body)] text-[var(--text-muted)]",
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
