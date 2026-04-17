"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useSession } from "next-auth/react";
import { PageActions } from "@/components/layout/page-actions";
import { PageHeading } from "@/components/layout/page-heading";
import { ACCOUNTING_CATEGORIES, ACCOUNTING_TABS, type AccountingTab } from "@/lib/accounting/tab-config";
import { filterAccountingTabsByFeatures } from "@/lib/accounting/visibility";
import { cn } from "@/lib/utils";
import { getWorkspaceModulePresentation } from "@/lib/workspace-products";

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
  title,
  description,
}: AccountingShellProps) {
  const { data: session } = useSession();
  const enabledFeatures = useMemo(
    () => (session?.user as { enabledFeatures?: string[] } | undefined)?.enabledFeatures,
    [session],
  );
  const workspaceProfile = (session?.user as { workspaceProfile?: string } | undefined)?.workspaceProfile;
  const modulePresentation = useMemo(
    () =>
      getWorkspaceModulePresentation({
        moduleId: "accounting",
        enabledFeatures,
        workspaceProfile,
      }),
    [enabledFeatures, workspaceProfile],
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
    <div className="w-full space-y-4">
      {actions ? <PageActions>{actions}</PageActions> : null}
      <PageHeading
        title={title ?? modulePresentation.title}
        className="mb-2"
      />

      <div className="flex gap-6">
        {/* Vertical category nav — sidebar-style */}
        <nav
          aria-label="Accounting category navigation"
          className="flex w-[11rem] shrink-0 flex-col gap-0.5"
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
                  "flex items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-[13.5px] font-medium transition-[background-color,color,transform] duration-[var(--motion-duration-fast)] ease-[var(--motion-ease-standard)]",
                  "hover:translate-x-[1px] hover:bg-surface-base hover:text-text-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30",
                  isActive
                    ? "bg-surface-base text-[var(--sidebar-item-active-fg)] shadow-popover"
                    : "text-[var(--sidebar-item-fg-muted)]",
                )}
              >
                <category.icon
                  className={cn(
                    "h-4 w-4 shrink-0",
                    isActive ? "text-[var(--sidebar-item-active-fg)]" : "text-[var(--sidebar-item-icon)]",
                  )}
                />
                <span className="truncate">{category.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Content area */}
        <div className="min-w-0 flex-1 space-y-5">
          {/* Sub-tabs row — horizontal tabs only */}
          {visibleTabsForActiveCategory.length > 1 && (
            <nav
              aria-label="Accounting section navigation"
              className="flex w-full flex-wrap gap-1 border-b border-[var(--edge-subtle)] pb-0"
            >
              {visibleTabsForActiveCategory.map((tab) => {
                const isActive = activeTab === tab.id;
                return (
                  <Link
                    key={tab.id}
                    href={tab.href}
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      "inline-flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-1.5 text-sm font-semibold transition-colors",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30",
                      isActive
                        ? "border-[var(--action-primary-bg)] text-[var(--action-primary-bg)]"
                        : "border-transparent text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <tab.icon className="size-4" />
                    {tab.label}
                  </Link>
                );
              })}
            </nav>
          )}

          {children}
        </div>
      </div>
    </div>
  );
}
