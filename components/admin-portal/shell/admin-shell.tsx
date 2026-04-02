"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { AdminCommandBar } from "./admin-command-bar";
import { AdminOperatorContext } from "./admin-operator-context";
import { AdminSidebar } from "./admin-sidebar";
import { AdminShellProvider, useAdminShell } from "./admin-shell-context";

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

function buildCrumbs(pathname: string, activeCompanyName?: string, activeCompanyId?: string): Crumb[] {
  const normalizedPath = pathname.replace(/^\/portal/, "");
  const segments = normalizedPath.split("/").filter(Boolean);
  const crumbs: Crumb[] = [{ label: "Admin", href: "/admin/dashboard" }];

  if (segments[1] === "clients") {
    crumbs.push({ label: "Workspaces", href: "/admin/clients" });
    if (segments[2]) {
      crumbs.push({ label: activeCompanyName ?? "Workspace", href: activeCompanyId ? `/admin/clients/${activeCompanyId}` : undefined });
    }
    return crumbs;
  }

  if (segments[1] === "company") {
    crumbs.push({ label: activeCompanyName ?? "Workspace", href: activeCompanyId ? `/admin/clients/${activeCompanyId}` : undefined });
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
    <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 overflow-x-auto text-[11px] text-[var(--text-muted)]">
      {crumbs.map((crumb, index) => {
        const isLast = index === crumbs.length - 1;
        return (
          <span key={`${crumb.label}-${index}`} className="flex items-center gap-1.5">
            {index > 0 ? <ChevronRight className="h-3 w-3 shrink-0 text-[var(--text-muted)]" /> : null}
            {crumb.href && !isLast ? (
              <Link href={crumb.href} className="whitespace-nowrap hover:text-[var(--text-strong)]">
                {crumb.label}
              </Link>
            ) : (
              <span className={`whitespace-nowrap ${isLast ? "font-semibold text-[var(--text-strong)]" : ""}`}>{crumb.label}</span>
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

  return (
    <div data-portal="admin" className="min-h-screen w-full bg-[var(--surface-canvas)] text-[var(--text-strong)] xl:grid xl:grid-cols-[15rem_minmax(0,1fr)]">
      <AdminSidebar activeCompanyId={activeCompanyId} companies={companies} />
      <div className="min-w-0">
        <header className="sticky top-0 z-20 bg-[var(--surface-base)]/95 shadow-[0_1px_0_var(--border-default)] backdrop-blur-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 md:px-4">
            <div className="min-w-0 flex-1">
              <AdminBreadcrumbs activeCompanyId={activeCompanyId} />
            </div>
            <div className="flex w-full items-center justify-end gap-1.5 md:w-auto md:max-w-[27rem] md:flex-none">
              <div className="min-w-0 flex-1 md:w-[19rem]">
                <AdminCommandBar />
              </div>
              <AdminOperatorContext />
            </div>
          </div>
        </header>
        <main className="min-w-0 px-3 py-4 md:px-4">{children}</main>
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
      <AdminShellFrame activeCompanyId={activeCompanyId}>{children}</AdminShellFrame>
    </AdminShellProvider>
  );
}
