"use client";

import { useMemo, type CSSProperties, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";

import { PageChrome } from "@/components/layout/page-chrome";
import { NavRail } from "@/components/ui/nav-rail";
import { NavGroup, NavItem } from "@/components/ui/settings-rail";
import {
  getAreaLabel,
  getVisibleManagementAreaNavItems,
  getVisibleManagementModuleItems,
  isActiveHref,
  isPathMatchingPrefix,
  type ManagementArea,
} from "@/lib/settings/management-nav";

type ManagementShellProps = {
  area: ManagementArea;
  /**
   * The section, not the module — "Job grades", not "Master data". It names
   * the band; where it is the area's own name there is no second name to
   * state and the band drops it.
   */
  title: string;
  /** The section's lede, read as a fragment after the name rather than as a sentence under it. */
  description?: string;
  /** The section's primary verb. One per section, in the band. */
  actions?: ReactNode;
  children: ReactNode;
};

/**
 * The frame every management section sits in: the app bar names the module,
 * the band names the section, the rail is the map, and the panel below is one
 * page deep.
 *
 * ## Why the band carries the name
 *
 * The rail highlight is the only other thing that says which section is open,
 * and it scrolls away with the rail on a narrow window — so
 * the one line that never scrolls is where the section's name belongs. The
 * module's name is not repeated there: "Master data" is already what the
 * sidebar entry you clicked says, and the app bar is already showing it.
 *
 * That is also why the band draws at all only when there is a second name to
 * state. Branding and Document templates are single-section areas whose
 * section name *is* the area name, and a band that repeats the bar is a band
 * of vertical space spent on nothing.
 *
 * ## Why the primary action is in the band and not in the panel
 *
 * The verb is the one thing you can do on any section, so it should sit in the
 * same place on all of them rather than wherever each panel happens to compose
 * its own header. It was in the panel once: on a 390px screen that put "New
 * department" about four hundred pixels down — under a title the bar was
 * already showing, under the description, and under the whole
 * search-and-pagination row — so the one verb on the page was the last thing
 * you could reach. The band is sticky, so it is reachable from anywhere in a
 * list of four hundred rows and it sits beside the section it acts on.
 *
 * There is no sticky unsaved bar anywhere below it, for the same reason: a
 * section commits each record as it is edited, so saving is a property of the
 * page rather than of any panel on it.
 */
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
    () => getVisibleManagementModuleItems(enabledFeatures),
    [enabledFeatures],
  );
  const visibleAreaTabs = useMemo(
    () => getVisibleManagementAreaNavItems(area, enabledFeatures),
    [area, enabledFeatures],
  );
  const areaLabel = getAreaLabel(area);

  // Compared case-insensitively: the rail and the page reached the same name
  // by two routes and one of them capitalises it differently.
  const section = title.trim().toLowerCase() === areaLabel.toLowerCase() ? undefined : title.trim();
  /* z-40 rather than the 30 a page band usually carries: a section drawn by
     another module can bring a band of its own, and the outer one has to be
     the one that stays on top — two opaque strips fighting over the same
     offset is a torn edge rather than a seam. The offset they should be
     pinning to is published below as `--stack-top`. */
  const band = section || actions ? (
    <div className="band-shell sticky top-0 z-40 mb-4 flex min-h-[var(--page-band-h)] items-center gap-2.5 border-b border-[var(--border)] bg-[var(--canvas)]">
      {/* `h2`: the bar's `h1` names the module and this names the section
          inside it, so the two read as the levels they are. */}
      {section ? (
        <h2 className="shrink-0 text-base font-bold leading-tight tracking-[-0.012em] text-[var(--text-strong)]">
          {section}
        </h2>
      ) : null}
      {/* Hidden below `md`: the lede is the half a reader already has from the
          rail entry they pressed, and on a phone the band's width is owed to
          the name and the verb. */}
      {section && description ? (
        <span className="hidden min-w-0 truncate border-l border-[var(--border)] pl-2.5 text-sm text-[var(--text-subtle)] md:inline">
          {description}
        </span>
      ) : null}
      {actions ? <div className="ml-auto flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  ) : null;

  return (
    <div className="mx-auto w-full">
      {/* The app bar names the module you are in. It used to name the section
          instead, which the band now does — and a page that repeats its own
          name sixty pixels lower has spent the band on nothing. */}
      <PageChrome title={areaLabel} />

      {/* Above the rail, not beside it: the band spans the section and its
          navigation both, the same way CRM's settings band spans its own. */}
      {band}

      <div className="settings-layout container mx-auto w-full">
        {/* A rail on a desktop, a scrolling strip on a phone. Stacked, these
            thirteen sections were five hundred pixels of navigation above the
            page they navigate to — you scrolled past the whole of Settings to
            reach Master Data's own content. */}
        <NavRail
          className="settings-rail"
          label="Management navigation"
          orientation="responsive"
        >
          <NavGroup label="Settings">
            {visibleModules.map((module) => {
              const ModuleIcon = module.icon;
              return (
                <NavItem
                  key={module.id}
                  to={module.href}
                  active={isPathMatchingPrefix(pathname, module.matchPrefixes)}
                  icon={ModuleIcon ? <ModuleIcon className="size-4" aria-hidden="true" /> : undefined}
                >
                  {module.label}
                </NavItem>
              );
            })}
          </NavGroup>

          <NavGroup label={areaLabel}>
            {visibleAreaTabs.map((tab) => {
              const TabIcon = tab.icon;
              return (
                <NavItem
                  key={tab.id}
                  to={tab.href}
                  active={isActiveHref(pathname, tab.href)}
                  icon={TabIcon ? <TabIcon className="size-4" aria-hidden="true" /> : undefined}
                >
                  {tab.label}
                </NavItem>
              );
            })}
          </NavGroup>
        </NavRail>

        {/* `band-stack-content` publishes the offset anything sticky below
            pins to. With no band above there is nothing to clear, so it goes
            back to zero rather than reserving 44px for a band never drawn.
            No `max-w` here: these are tables beside a detail pane, and a cap
            leaves dead margin on each side of exactly the surfaces that are
            short of width. */}
        <section className="settings-content">
          {/* One child, so the DS grid's own 40px gap governs nothing and the
              spacing between panels is this stack's to state. */}
          <div
            className="band-stack-content w-full space-y-6"
            style={band ? undefined : ({ "--stack-top": "0px" } as CSSProperties)}
          >
            {children}
          </div>
        </section>
      </div>
    </div>
  );
}
