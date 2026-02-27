"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useSession } from "next-auth/react";
import { PageActions } from "@/components/layout/page-actions";
import { PageHeading } from "@/components/layout/page-heading";
import { ACCOUNTING_CATEGORIES, ACCOUNTING_TABS, type AccountingTab } from "@/lib/accounting/tab-config";
import { filterAccountingTabsByFeatures } from "@/lib/accounting/visibility";
import { cn } from "@/lib/utils";

export type { AccountingTab } from "@/lib/accounting/tab-config";

type AccountingShellProps = {
  activeTab: AccountingTab;
  actions?: React.ReactNode;
  children: React.ReactNode;
  title?: string;
  description?: string;
};

export function AccountingShell({
  activeTab,
  actions,
  children,
  title = "Accounting",
  description = "Ledger, journals, and finance controls",
}: AccountingShellProps) {
  const { data: session } = useSession();
  const enabledFeatures = useMemo(
    () => (session?.user as { enabledFeatures?: string[] } | undefined)?.enabledFeatures,
    [session],
  );
  const visibleTabs = useMemo(
    () => filterAccountingTabsByFeatures(ACCOUNTING_TABS, enabledFeatures),
    [enabledFeatures],
  );
  const activeCategoryId = useMemo(() => {
    const active = visibleTabs.find((tab) => tab.id === activeTab);
    return active?.categoryId ?? visibleTabs[0]?.categoryId ?? "hub";
  }, [activeTab, visibleTabs]);
  const visibleCategories = useMemo(
    () =>
      ACCOUNTING_CATEGORIES.filter((category) =>
        visibleTabs.some((tab) => tab.categoryId === category.id),
      ).sort((a, b) => a.order - b.order),
    [visibleTabs],
  );
  const visibleTabsForActiveCategory = useMemo(
    () => visibleTabs.filter((tab) => tab.categoryId === activeCategoryId),
    [activeCategoryId, visibleTabs],
  );

  return (
    <div className="w-full space-y-6">
      {actions ? <PageActions>{actions}</PageActions> : null}
      <PageHeading
        title={title}
        description={description}
        className="mb-4 [&_h1]:text-[1.375rem] [&_h1]:leading-8"
      />

      <nav
        aria-label="Accounting category navigation"
        className="flex w-full flex-wrap justify-start gap-2 border-b border-[var(--edge-subtle)] pb-1"
      >
        {visibleCategories.map((category) => {
          const categoryTab = visibleTabs.find((tab) => tab.categoryId === category.id);
          if (!categoryTab) return null;
          const isActive = activeCategoryId === category.id;
          return (
            <Link
              key={category.id}
              href={categoryTab.href}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "inline-flex items-center justify-center whitespace-nowrap border-b-2 px-3 py-1.5 text-sm font-semibold transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                isActive
                  ? "border-[var(--action-primary-bg)] text-[var(--action-primary-bg)]"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              <category.icon className="size-5" />
              <span className="ml-2">{category.label}</span>
            </Link>
          );
        })}
      </nav>

      <nav
        aria-label="Accounting section navigation"
        className="flex w-full flex-wrap justify-start gap-2 border-b border-[var(--edge-subtle)] pb-1"
      >
        {visibleTabsForActiveCategory.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <Link
              key={tab.id}
              href={tab.href}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "inline-flex items-center justify-center whitespace-nowrap border-b-2 px-3 py-1.5 text-sm font-semibold transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                isActive
                  ? "border-[var(--action-primary-bg)] text-[var(--action-primary-bg)]"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              <tab.icon className="size-5" />
              <span className="ml-2">{tab.label}</span>
            </Link>
          );
        })}
      </nav>

      {children}
    </div>
  );
}
