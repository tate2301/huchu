"use client";

import { useMemo } from "react";
import { useSession } from "next-auth/react";
import { PageActions } from "@/components/layout/page-actions";
import { NavRail, NavRailGroup, NavRailItem } from "@/components/ui/nav-rail";
import { ACCOUNTING_CATEGORIES, ACCOUNTING_TABS, type AccountingTab } from "@/lib/accounting/tab-config";
import { filterAccountingTabsByFeatures } from "@/lib/accounting/visibility";
import { getWorkspaceModulePresentation } from "@/lib/workspace-products";

export type { AccountingTab } from "@/lib/accounting/tab-config";

type AccountingShellProps = {
  activeTab: AccountingTab;
  /** Rendered in the app bar, not inline — see `PageActions`. */
  actions?: React.ReactNode;
  children: React.ReactNode;
  title?: string;
  /** One line under the title, in the page band. Hidden below `md`. */
  description?: string;
  /**
   * Anything the page needs permanently in view, pinned to the right of the
   * band: the open period, a balance, a "3 in draft" count. Kept small and
   * quiet — this is context, not a second action bar.
   */
  bandSlot?: React.ReactNode;
};

export function AccountingShell({
  activeTab,
  actions,
  children,
  title,
  description,
  bandSlot,
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
    <div className="w-full space-y-4">
      {actions ? <PageActions>{actions}</PageActions> : null}

      {/*
        The page band.

        This replaces the design system's `PageHeader`, which rendered the page
        title as a large H1 in a block that scrolled away — while the app bar
        directly above it showed the same title, permanently. Two titles, one
        of them 40px tall and neither of them there when you needed it: by the
        time you were far enough down a trial balance to forget which report
        you were reading, the H1 had gone and the column headers had gone with
        it.

        One 44px band, pinned. It carries what the app bar cannot: the page's
        own name, its lede, and — through `bandSlot` — whatever that page needs
        permanently in view, which for accounting is usually a period or a
        balance. Actions stay in the app bar via `PageActions`.
      */}
      <div className="band-shell sticky top-0 z-30 flex min-h-[var(--page-band-h)] items-center gap-2.5 border-b border-[var(--border)] bg-[var(--canvas)]">
        <h1 className="text-base font-bold leading-tight tracking-[-0.012em] text-[var(--text-strong)]">
          {title ?? modulePresentation.title}
        </h1>
        {description ? (
          <span className="hidden min-w-0 truncate border-l border-[var(--border)] pl-2.5 text-sm text-[var(--text-subtle)] md:inline">
            {description}
          </span>
        ) : null}
        {bandSlot ? (
          <div className="ml-auto flex shrink-0 items-center gap-2">{bandSlot}</div>
        ) : null}
      </div>

      <div className="flex flex-col gap-4 pt-4 lg:flex-row lg:gap-6">
        {/* One rail, grouped by category. No tab strip below it. */}
        <NavRail
          label="Accounting navigation"
          orientation="responsive"
          // Pins below the band, not to the viewport: the band is 44px of
          // opaque chrome at top 0, so a rail stuck at 0 would slide under it.
          className="lg:sticky lg:top-[calc(var(--page-band-h)+1rem)] lg:w-[var(--rail-w)] lg:shrink-0 lg:self-start"
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

        {/*
          Content area. `--views-top` tells any view switcher inside where the
          sticky stack has got to: the band owns the first 44px, so a strip
          pins beneath it rather than under it.
        */}
        <div className="band-stack-content min-w-0 flex-1 space-y-5 pb-8">
          {children}
        </div>
      </div>
    </div>
  );
}
