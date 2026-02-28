"use client";

import Link from "next/link";
import { useMemo } from "react";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { PageHeading } from "@/components/layout/page-heading";
import { filterHrefItemsByEnabledFeatures } from "@/lib/platform/gating/nav-filter";
import {
  getAreaLabel,
  getAreaNavItems,
  isActiveHref,
  isPathMatchingPrefix,
  managementModuleItems,
  type ManagementArea,
} from "@/lib/settings/management-nav";
import { cn } from "@/lib/utils";

type ManagementShellProps = {
  area: ManagementArea;
  title: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
};

export function ManagementShell({
  area,
  title,
  description,
  actions,
  children,
}: ManagementShellProps) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const enabledFeatures = useMemo(
    () => (session?.user as { enabledFeatures?: string[] } | undefined)?.enabledFeatures,
    [session],
  );

  const visibleModules = useMemo(
    () => filterHrefItemsByEnabledFeatures(managementModuleItems, enabledFeatures),
    [enabledFeatures],
  );
  const visibleAreaTabs = useMemo(
    () => filterHrefItemsByEnabledFeatures(getAreaNavItems(area), enabledFeatures),
    [area, enabledFeatures],
  );
  const areaLabel = getAreaLabel(area);

  return (
    <div className="w-full min-h-[calc(100vh-var(--app-header-height,3.5rem)-3.25rem)]">
      <div className="grid w-full gap-6 lg:grid-cols-[17rem_minmax(0,1fr)] xl:grid-cols-[18rem_minmax(0,1fr)]">
        <aside className="lg:sticky lg:top-[calc(var(--app-header-height,3.5rem)+0.75rem)] lg:h-[calc(100vh-var(--app-header-height,3.5rem)-1.5rem)]">
          <div className="flex h-full min-h-[24rem] flex-col rounded-xl border border-[var(--edge-subtle)] bg-sidebar p-2 shadow-[var(--surface-frame-shadow)]">
            <div className="overflow-y-auto pr-1">
              <div className="mb-3 px-2 pt-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground/60">
                  Settings
                </p>
              </div>

              <nav aria-label="Settings areas" className="space-y-0.5">
                {visibleModules.map((module) => {
                  const moduleActive = isPathMatchingPrefix(pathname, module.matchPrefixes);
                  const ModuleIcon = module.icon;
                  return (
                    <Link
                      key={module.id}
                      href={module.href}
                      data-active={moduleActive}
                      className={cn(
                        "relative flex h-9 w-full items-center gap-2 rounded-lg px-2 text-[13px] font-medium text-sidebar-foreground/80",
                        "before:absolute before:inset-y-1 before:left-0 before:w-0.5 before:rounded-full before:bg-primary before:opacity-0 before:transition-opacity",
                        "transition-[color,background-color,box-shadow] duration-150 hover:bg-[var(--surface-elevated)] hover:shadow-[var(--action-outline-shadow-hover)] hover:text-foreground",
                        "data-[active=true]:bg-[var(--surface-elevated)] data-[active=true]:text-foreground data-[active=true]:shadow-[var(--action-outline-shadow-hover)] data-[active=true]:before:opacity-100",
                      )}
                    >
                      {ModuleIcon ? (
                        <ModuleIcon
                          className={cn(
                            "h-4 w-4 shrink-0",
                            moduleActive ? "text-primary" : "text-muted-foreground",
                          )}
                        />
                      ) : null}
                      <span className="truncate">{module.label}</span>
                    </Link>
                  );
                })}
              </nav>

              <div className="my-3 border-t border-[var(--edge-subtle)]" />

              <div className="mb-2 px-2">
                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground/60">
                  <span>{areaLabel}</span>
                </div>
              </div>

              <nav aria-label={`${areaLabel} sections`} className="space-y-0.5">
                {visibleAreaTabs.map((tab) => {
                  const active = isActiveHref(pathname, tab.href);
                  return (
                    <Link
                      key={tab.id}
                      href={tab.href}
                      data-active={active}
                      className={cn(
                        "relative flex h-9 w-full items-center rounded-lg px-2 text-[13px] font-medium text-sidebar-foreground/80",
                        "before:absolute before:inset-y-1 before:left-0 before:w-0.5 before:rounded-full before:bg-primary before:opacity-0 before:transition-opacity",
                        "transition-[color,background-color,box-shadow] duration-150 hover:bg-[var(--surface-elevated)] hover:shadow-[var(--action-outline-shadow-hover)] hover:text-foreground",
                        "data-[active=true]:bg-[var(--surface-elevated)] data-[active=true]:text-foreground data-[active=true]:shadow-[var(--action-outline-shadow-hover)] data-[active=true]:before:opacity-100",
                      )}
                    >
                      <span className="truncate">{tab.label}</span>
                    </Link>
                  );
                })}
              </nav>
            </div>
          </div>
        </aside>

        <section className="min-w-0 space-y-6 xl:pr-10">
          <div className="flex flex-col gap-4 border-b border-[var(--edge-subtle)] pb-4 sm:flex-row sm:items-start sm:justify-between">
            <PageHeading title={title} description={description} className="mb-0" />
            {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
          </div>
          <div className="w-full max-w-[96rem] space-y-6">{children}</div>
        </section>
      </div>
    </div>
  );
}
