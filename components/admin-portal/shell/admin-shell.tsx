"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ChevronRight, Menu, X } from "lucide-react";
import { AdminCommandBar } from "./admin-command-bar";
import { AdminOperatorContext } from "./admin-operator-context";
import { AdminSidebar } from "./admin-sidebar";
import { AdminShellProvider, useAdminShell } from "./admin-shell-context";
import { Button } from "@/components/ui/button";

type Crumb = {
  label: string;
  href?: string;
};

const LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  clients: "Workspaces",
  identity: "Identity",
  "support-access": "Support Access",
  reliability: "Reliability",
  commercial: "Commercial",
  settings: "Settings",
};

function buildCrumbs(
  pathname: string,
  activeCompanyName?: string,
  activeCompanyId?: string,
): Crumb[] {
  const normalizedPath = pathname.replace(/^\/portal/, "");
  const segments = normalizedPath.split("/").filter(Boolean);
  const crumbs: Crumb[] = [{ label: "Admin", href: "/admin/dashboard" }];

  if (segments[1] === "clients") {
    crumbs.push({ label: "Workspaces", href: "/admin/clients" });
    if (segments[2]) {
      crumbs.push({
        label: activeCompanyName ?? "Workspace",
        href: activeCompanyId ? `/admin/clients/${activeCompanyId}` : undefined,
      });
    }
    return crumbs;
  }

  if (segments[1] === "company") {
    crumbs.push({
      label: activeCompanyName ?? "Workspace",
      href: activeCompanyId ? `/admin/clients/${activeCompanyId}` : undefined,
    });
    if (segments[3]) {
      crumbs.push({ label: LABELS[segments[3]] ?? segments[3] });
    }
    return crumbs;
  }

  if (segments[1]) {
    crumbs.push({ label: LABELS[segments[1]] ?? segments[1] });
  }

  return crumbs;
}

function AdminBreadcrumbs({ activeCompanyId }: { activeCompanyId?: string }) {
  const pathname = usePathname();
  const { activeCompany } = useAdminShell();
  const crumbs = buildCrumbs(pathname, activeCompany?.name, activeCompanyId);

  return (
    <nav
      aria-label="Breadcrumb"
      className="flex min-w-0 items-center gap-1.5 overflow-x-auto text-sm text-[var(--text-muted)]"
    >
      {crumbs.map((crumb, index) => {
        const isLast = index === crumbs.length - 1;
        return (
          <span
            key={`${crumb.label}-${index}`}
            className="flex items-center gap-1.5"
          >
            {index > 0 ? (
              <ChevronRight className="h-3 w-3 shrink-0 text-[var(--text-muted)]" />
            ) : null}
            {crumb.href && !isLast ? (
              <Link
                href={crumb.href}
                className="whitespace-nowrap hover:text-[var(--text-strong)]"
              >
                {crumb.label}
              </Link>
            ) : (
              <span
                className={`whitespace-nowrap ${isLast ? "font-semibold text-[var(--text-strong)]" : ""}`}
              >
                {crumb.label}
              </span>
            )}
          </span>
        );
      })}
    </nav>
  );
}

function AdminShellFrame({
  activeCompanyId,
  children,
}: {
  activeCompanyId?: string;
  children: React.ReactNode;
}) {
  const { companies } = useAdminShell();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const closeSidebar = () => setIsSidebarOpen(false);

  return (
    <div
      data-portal="admin"
      className="admin-shell-frame text-[var(--text-strong)]"
    >
      <div className="admin-shell-window relative overflow-hidden xl:grid xl:grid-cols-[17.5rem_minmax(0,1fr)]">
        {isSidebarOpen ? (
          <div
            className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[2px] xl:hidden"
            onClick={closeSidebar}
            aria-hidden="true"
          />
        ) : null}

        <div
          className={`admin-shell-sidebar fixed inset-y-0 left-0 z-50 w-[min(18rem,calc(100vw-2rem))] transform transition-transform duration-[var(--motion-duration-base)] ease-[var(--motion-ease-standard)] xl:relative xl:inset-auto xl:z-auto xl:w-auto xl:translate-x-0 ${
            isSidebarOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <AdminSidebar
            activeCompanyId={activeCompanyId}
            companies={companies}
            onNavigate={closeSidebar}
          />
        </div>

        <div className="min-w-0 p-2 ">
          <div className="rounded-xl bg-white overflow-clip">
            <header className="sticky top-0 z-30">
              <div className="flex items-center gap-3 px-4 py-3 md:px-5">
                <div className="flex gap-2 flex-1 items-center">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="xl:hidden"
                    onClick={() => setIsSidebarOpen((current) => !current)}
                    aria-label="Toggle admin navigation"
                  >
                    {isSidebarOpen ? (
                      <X className="h-4 w-4" />
                    ) : (
                      <Menu className="h-4 w-4" />
                    )}
                  </Button>
                  <div className="min-w-0 flex-1">
                    <AdminBreadcrumbs activeCompanyId={activeCompanyId} />
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="hidden min-w-0 w-64 flex-1 xl:flex">
                    <AdminCommandBar />
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <AdminOperatorContext />
                  </div>
                </div>
              </div>
              <div className="px-4 py-2 xl:hidden">
                <AdminCommandBar />
              </div>
            </header>
            <main className="min-w-0 px-4 pb-8 pt-5  md:pb-10 md:pt-6">
              {children}
            </main>
          </div>
        </div>
      </div>
    </div>
  );
}

export function AdminShell({
  activeCompanyId,
  children,
}: {
  activeCompanyId?: string;
  children: React.ReactNode;
}) {
  return (
    <AdminShellProvider activeCompanyId={activeCompanyId}>
      <AdminShellFrame activeCompanyId={activeCompanyId}>
        {children}
      </AdminShellFrame>
    </AdminShellProvider>
  );
}
