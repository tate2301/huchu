"use client";

import Link from "next/link";
import { useMemo } from "react";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { PageHeading } from "@/components/layout/page-heading";
import {
  getAreaLabel,
  getVisibleManagementAreaNavItems,
  getVisibleManagementModuleItems,
  isActiveHref,
  isPathMatchingPrefix,
  type ManagementArea,
} from "@/lib/settings/management-nav";
import { cn } from "@/lib/utils";
import { getWorkspaceModulePresentation } from "@/lib/workspace-products";

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
  const workspaceProfile = (session?.user as { workspaceProfile?: string } | undefined)?.workspaceProfile;
  const modulePresentation = useMemo(
    () =>
      getWorkspaceModulePresentation({
        moduleId: "management",
        enabledFeatures,
        workspaceProfile,
      }),
    [enabledFeatures, workspaceProfile],
  );

  const visibleModules = useMemo(
    () => getVisibleManagementModuleItems(enabledFeatures),
    [enabledFeatures],
  );
  const visibleAreaTabs = useMemo(
    () => getVisibleManagementAreaNavItems(area, enabledFeatures),
    [area, enabledFeatures],
  );
  const areaLabel = getAreaLabel(area);

  return (
    <div className="w-full min-h-[calc(100vh-var(--app-header-height,3.5rem)-3.25rem)]">
      <div className="grid w-full gap-6 lg:grid-cols-[16rem_minmax(0,1fr)] xl:grid-cols-[17rem_minmax(0,1fr)]">
        <aside className="space-y-5 lg:sticky lg:top-[calc(var(--app-header-height,3.5rem)+0.75rem)] lg:h-[calc(100vh-var(--app-header-height,3.5rem)-1.5rem)] lg:overflow-y-auto">
          <div className="space-y-2">
            <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground/60">
              Settings
            </p>
            <nav
              aria-label="Settings areas"
              className="flex gap-2 overflow-x-auto pb-1 lg:grid lg:gap-1 lg:overflow-visible lg:pb-0"
            >
                {visibleModules.map((module) => {
                  const moduleActive = isPathMatchingPrefix(pathname, module.matchPrefixes);
                  const ModuleIcon = module.icon;
                  return (
                    <Link
                      key={module.id}
                      href={module.href}
                      data-active={moduleActive}
                      className={cn(
                        "relative inline-flex h-9 shrink-0 items-center gap-2 rounded-full border border-[var(--edge-subtle)] bg-background px-3 text-[13px] font-medium text-sidebar-foreground/80 lg:w-full lg:rounded-xl",
                        "before:absolute before:inset-y-1 before:left-0 before:w-0.5 before:rounded-full before:bg-primary before:opacity-0 before:transition-opacity lg:before:left-1",
                        "transition-[color,background-color,border-color,box-shadow] duration-150 hover:border-[var(--edge-strong)] hover:bg-[var(--surface-elevated)] hover:text-foreground",
                        "data-[active=true]:border-[color:color-mix(in_srgb,var(--primary)_28%,var(--edge-subtle))] data-[active=true]:bg-[var(--surface-elevated)] data-[active=true]:text-foreground data-[active=true]:shadow-[var(--action-outline-shadow-hover)] data-[active=true]:before:opacity-100",
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
          </div>

          <div className="space-y-2">
            <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground/60">
              {areaLabel}
            </p>
            <nav
              aria-label={`${areaLabel} sections`}
              className="flex gap-2 overflow-x-auto pb-1 lg:grid lg:gap-1 lg:overflow-visible lg:pb-0"
            >
                {visibleAreaTabs.map((tab) => {
                  const active = isActiveHref(pathname, tab.href);
                  return (
                    <Link
                      key={tab.id}
                      href={tab.href}
                      data-active={active}
                      className={cn(
                        "relative inline-flex h-9 shrink-0 items-center rounded-full border border-transparent px-3 text-[13px] font-medium text-sidebar-foreground/80 lg:w-full lg:rounded-xl",
                        "before:absolute before:inset-y-1 before:left-0 before:w-0.5 before:rounded-full before:bg-primary before:opacity-0 before:transition-opacity lg:before:left-1",
                        "transition-[color,background-color,border-color,box-shadow] duration-150 hover:border-[var(--edge-subtle)] hover:bg-[var(--surface-elevated)] hover:text-foreground",
                        "data-[active=true]:border-[color:color-mix(in_srgb,var(--primary)_24%,var(--edge-subtle))] data-[active=true]:bg-[var(--surface-elevated)] data-[active=true]:text-foreground data-[active=true]:shadow-[var(--action-outline-shadow-hover)] data-[active=true]:before:opacity-100",
                      )}
                    >
                      <span className="truncate">{tab.label}</span>
                    </Link>
                  );
                })}
            </nav>
          </div>
        </aside>

        <section className="min-w-0 space-y-6 xl:pr-10">
          <div className="flex flex-col gap-4 border-b border-[var(--edge-subtle)] pb-4 sm:flex-row sm:items-start sm:justify-between">
            <PageHeading
              title={title || modulePresentation.title}
              className="mb-0"
            />
            {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
          </div>
          <div className="w-full max-w-[96rem] space-y-6">{children}</div>
        </section>
      </div>
    </div>
  );
}
