"use client";

import { useMemo } from "react";
import { useSession } from "next-auth/react";
import { PageActions, PageChrome } from "@/components/layout/page-chrome";
import { NavRail, NavRailGroup, NavRailItem } from "@/components/ui/nav-rail";
import { ACCOUNTING_CATEGORIES, ACCOUNTING_TABS, type AccountingTab } from "@/lib/accounting/tab-config";
import { filterAccountingTabsByFeatures } from "@/lib/accounting/visibility";

export type { AccountingTab } from "@/lib/accounting/tab-config";

type AccountingShellProps = {
  activeTab: AccountingTab;
  /** Rendered in the app bar, not inline — see `PageActions`. */
  actions?: React.ReactNode;
  children: React.ReactNode;
  /**
   * The page's own name, for the app bar. Left off, the bar keeps the name
   * the route table gives this screen.
   */
  title?: string;
};

export function AccountingShell({
  activeTab,
  actions,
  children,
  title,
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
  // No `activeCategoryId`: the rail shows every category at once now, so
  // there is no "which category am I in" to resolve — `activeTab` alone marks
  // the current item.
  const visibleCategories = useMemo(
    () =>
      ACCOUNTING_CATEGORIES.filter((category) =>
        visibleTabs.some((tab) => tab.categoryId === category.id),
      ).sort((a, b) => a.order - b.order),
    [visibleTabs],
  );
  /**
   * The rail's contents: every category that has a visible tab, each carrying
   * its own tabs beneath it.
   *
   * This replaces a category rail *plus* a horizontal tab strip. Those were two
   * levels of navigation for one decision — you picked "Receivables" in the
   * rail and then picked again in a strip below it — and between them they cost
   * a 184px column and a whole horizontal band before any data appeared. One
   * grouped rail says the same thing in the space of the rail alone, and every
   * destination in the module is visible at once instead of only the siblings
   * of whatever you last clicked.
   */
  const railGroups = useMemo(
    () =>
      visibleCategories
        .map((category) => ({
          category,
          tabs: visibleTabs.filter((tab) => tab.categoryId === category.id),
        }))
        .filter((group) => group.tabs.length > 0),
    [visibleCategories, visibleTabs],
  );

  return (
    // See the note in `ModuleShell`: no container, no centring. Accounting is
    // the widest module in the app — a trial balance is eight numeric columns
    // — and it was the one paying the most for the cap.
    <div className="w-full">
      {/* The page names itself once, in the app bar. The pinned band that
          used to sit under it repeated the name and carried count chips; a
          working page has no summary band. */}
      {title ? (
        <PageChrome title={title}>{actions}</PageChrome>
      ) : actions ? (
        <PageActions>{actions}</PageActions>
      ) : null}

      <div className="flex flex-col gap-4 lg:flex-row lg:gap-6">
        {/* One rail, grouped by category. No tab strip below it. */}
        <NavRail
          label="Accounting navigation"
          orientation="responsive"
          className="lg:sticky lg:top-4 lg:w-[var(--rail-w)] lg:shrink-0 lg:self-start"
        >
          {railGroups.map(({ category, tabs }) => (
            <NavRailGroup key={category.id} label={category.label}>
              {tabs.map((tab) => (
                <NavRailItem
                  key={tab.id}
                  to={tab.href}
                  active={activeTab === tab.id}
                  icon={<tab.icon className="size-4" aria-hidden="true" />}
                >
                  {tab.label}
                </NavRailItem>
              ))}
            </NavRailGroup>
          ))}
        </NavRail>

        <div className="band-stack-content min-w-0 flex-1 space-y-5 pb-8">
          {children}
        </div>
      </div>
    </div>
  );
}
