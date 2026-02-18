"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useSession } from "next-auth/react";
import { PageActions } from "@/components/layout/page-actions";
import { PageHeading } from "@/components/layout/page-heading";
import { filterHrefItemsByEnabledFeatures } from "@/lib/platform/gating/nav-filter";
import { cn } from "@/lib/utils";

export type MasterDataTab =
  | "overview"
  | "departments"
  | "job-grades"
  | "sites"
  | "sections"
  | "downtime-codes";

type TabItem = {
  id: MasterDataTab;
  label: string;
  href: string;
};

const tabItems: TabItem[] = [
  { id: "overview", label: "Overview", href: "/management/master-data" },
  { id: "departments", label: "Departments", href: "/management/master-data/hr/departments" },
  { id: "job-grades", label: "Job Grades", href: "/management/master-data/hr/job-grades" },
  { id: "sites", label: "Sites", href: "/management/master-data/operations/sites" },
  { id: "sections", label: "Sections", href: "/management/master-data/operations/sections" },
  {
    id: "downtime-codes",
    label: "Downtime Codes",
    href: "/management/master-data/operations/downtime-codes",
  },
];

type MasterDataShellProps = {
  activeTab: MasterDataTab;
  title: string;
  description: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
};

export function MasterDataShell({
  activeTab,
  title,
  description,
  actions,
  children,
}: MasterDataShellProps) {
  const { data: session } = useSession();
  const enabledFeatures = useMemo(
    () => (session?.user as { enabledFeatures?: string[] } | undefined)?.enabledFeatures,
    [session],
  );
  const visibleTabs = useMemo(
    () => filterHrefItemsByEnabledFeatures(tabItems, enabledFeatures),
    [enabledFeatures],
  );

  return (
    <div className="w-full space-y-6">
      {actions ? <PageActions>{actions}</PageActions> : null}
      <PageHeading title={title} description={description} />

      <nav
        aria-label="Master data navigation"
        className="flex w-full flex-wrap justify-start gap-2 bg-transparent p-0 pb-1 shadow-[inset_0_-1px_0_0_var(--edge-neutral-rest)]"
      >
        {visibleTabs.map((tab) => {
          const isActive = tab.id === activeTab;
          return (
            <Link
              key={tab.id}
              href={tab.href}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "inline-flex items-center justify-center whitespace-nowrap px-3 py-1.5 text-sm font-semibold transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                isActive ? "text-primary" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>

      {children}
    </div>
  );
}
