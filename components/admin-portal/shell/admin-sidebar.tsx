"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { CompanyWorkspace } from "@/components/admin-portal/types";
import { WorkspaceSwitcher } from "./workspace-switcher";

const platformNav = [
  { href: "/admin/dashboard", label: "Dashboard" },
  { href: "/admin/clients", label: "Clients" },
  { href: "/admin/subscriptions", label: "Subscriptions" },
  { href: "/admin/add-ons", label: "Add-ons" },
  { href: "/admin/templates", label: "Templates" },
  { href: "/admin/feature-catalog", label: "Feature Catalog" },
  { href: "/admin/support-access", label: "Support Access" },
  { href: "/admin/health", label: "Health" },
  { href: "/admin/audit-log", label: "Audit Log" },
  { href: "/admin/settings", label: "Settings" },
];

const clientNav = (companyId: string) => [
  { href: `/admin/clients/${companyId}`, label: "Overview" },
  { href: `/admin/clients/${companyId}#subscription`, label: "Subscription" },
  { href: `/admin/clients/${companyId}#addons`, label: "Add-ons" },
  { href: `/admin/clients/${companyId}#features`, label: "Features" },
  { href: `/admin/clients/${companyId}#usage`, label: "Usage" },
  { href: `/admin/clients/${companyId}#audit`, label: "Audit" },
  { href: `/admin/company/${companyId}/operations`, label: "Operations" },
];

export function AdminSidebar({
  companies,
  activeCompanyId,
}: {
  companies: CompanyWorkspace[];
  activeCompanyId?: string;
}) {
  const pathname = usePathname();
  const normalizedPath = pathname.replace(/^\/portal/, "");
  const nav = activeCompanyId ? clientNav(activeCompanyId) : platformNav;

  return (
    <aside className="w-full space-y-4 rounded-xl border bg-[var(--surface-base)] p-3 md:w-72">
      <WorkspaceSwitcher activeCompanyId={activeCompanyId} companies={companies} />

      <nav className="space-y-1">
        {nav.map((item) => {
          const isActive =
            normalizedPath === item.href ||
            normalizedPath.startsWith(item.href.replace(/#.*/, "")) ||
            (activeCompanyId ? normalizedPath.startsWith(`/admin/company/${activeCompanyId}`) : false) ||
            (activeCompanyId ? normalizedPath.startsWith(`/admin/clients/${activeCompanyId}`) : false);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "block rounded-md px-3 py-2 text-sm",
                isActive
                  ? "bg-[var(--surface-muted)] font-semibold"
                  : "text-[var(--text-muted)] hover:bg-[var(--surface-muted)]",
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
