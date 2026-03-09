"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { CompanyWorkspace } from "@/components/admin-portal/types";
import { WorkspaceSwitcher } from "./workspace-switcher";

const platformNav = [
  { href: "/admin/dashboard", label: "Dashboard" },
  { href: "/admin/features", label: "Features" },
  { href: "/admin/companies", label: "Organizations" },
];

const companyNav = (companyId: string) => [
  { href: `/admin/company/${companyId}/dashboard`, label: "Dashboard" },
  { href: `/admin/company/${companyId}/features`, label: "Features" },
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
  const nav = activeCompanyId ? companyNav(activeCompanyId) : platformNav;

  return (
    <aside className="w-full space-y-4 rounded-xl border bg-[var(--surface-base)] p-3 md:w-72">
      <WorkspaceSwitcher activeCompanyId={activeCompanyId} companies={companies} />

      <nav className="space-y-1">
        {nav.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
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
