"use client";

import { useMemo } from "react";
import { useSession } from "next-auth/react";
import { PageActions, PageChrome } from "@/components/layout/page-chrome";
import { NavRail, NavRailGroup, NavRailItem } from "@/components/ui/nav-rail";
import { filterHrefItemsByEnabledFeatures } from "@/lib/platform/gating/nav-filter";
import { getNavSectionsForRole } from "@/lib/navigation";
import type { LucideIcon } from "@/lib/icons";

/**
 * A category rail plus a tab strip, filtered by what the tenant has bought.
 *
 * This was `HrShell`, hard-coded to one module. People and Payroll are two
 * modules with the same chrome, and the alternative was 137 duplicated lines that
 * would drift — the tab filtering here is subtle enough to be worth having in one
 * place: a tab is visible only if the *nav section* for the caller's role still
 * contains its href after feature filtering, so a screen cannot appear in the rail
 * that the route guard would then refuse.
 */

type ShellCategory<C extends string> = {
  id: C;
  label: string;
  icon: LucideIcon;
  order: number;
};

type ShellTab<T extends string, C extends string> = {
  id: T;
  label: string;
  href: string;
  icon: LucideIcon;
  categoryId: C;
};

type ModuleShellProps<T extends string, C extends string> = {
  /** The `lib/navigation.ts` section this module's tabs come from. */
  navSectionId: string;
  categories: ShellCategory<C>[];
  tabs: ShellTab<T, C>[];
  activeTab: T;
  /** Screen-reader label for the rail, e.g. "People". */
  railLabel: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  /**
   * The page's own name, for the app bar. Left off, the bar keeps the name
   * the route table gives this screen.
   */
  title?: string;
};

export function ModuleShell<T extends string, C extends string>({
  navSectionId,
  categories,
  tabs,
  activeTab,
  railLabel,
  actions,
  children,
  title,
}: ModuleShellProps<T, C>) {
  const { data: session } = useSession();
  const role = (session?.user as { role?: string } | undefined)?.role;
  const enabledFeatures = useMemo(
    () =>
      (session?.user as { enabledFeatures?: string[] } | undefined)
        ?.enabledFeatures,
    [session],
  );
  const visibleTabs = useMemo(() => {
    const section = getNavSectionsForRole(role).find(
      (candidate) => candidate.id === navSectionId,
    );
    const visibleHrefs = new Set(
      filterHrefItemsByEnabledFeatures(section?.items ?? [], enabledFeatures).map(
        (item) => item.href,
      ),
    );
    return tabs.filter((tab) => visibleHrefs.has(tab.href));
  }, [enabledFeatures, navSectionId, role, tabs]);

  // No `activeCategoryId`: the rail shows every category at once, so there is
  // no "which category am I in" to resolve — `activeTab` alone marks the
  // current item.
  const visibleCategories = useMemo(
    () =>
      categories
        .filter((category) =>
          visibleTabs.some((tab) => tab.categoryId === category.id),
        )
        .sort((a, b) => a.order - b.order),
    [categories, visibleTabs],
  );

  /** Every category that has a visible tab, each carrying its own tabs. */
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
    // No `container mx-auto`. Tailwind's `container` caps at 1536 and centres
    // the remainder, so on a 1920 screen this module gave up ~120px on each
    // side of a surface that is mostly tables — and the rail made the loss
    // read as a river between the sidebar and the content. Full width; the
    // gutter is the only inset.
    <div className="w-full">
      {/* The page names itself once, in the app bar — there is no band under
          it repeating the name. */}
      {title ? (
        <PageChrome title={title}>{actions}</PageChrome>
      ) : actions ? (
        <PageActions>{actions}</PageActions>
      ) : null}

      <div className="flex flex-col gap-4 lg:flex-row lg:gap-6">
        {/*
          One rail, grouped by category — no tab strip beneath it. Those were
          two levels of navigation for one decision: you picked a category in
          the rail, then picked again in a strip below it, and between them they
          cost a rail's width and a whole horizontal band before any data. Every
          destination in the module is now visible at once.
        */}
        <NavRail
          label={`${railLabel} navigation`}
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
