"use client";

import {
  Children,
  createElement,
  type ElementType,
  Fragment,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { getCurrentPageTitle } from "@/components/layout/breadcrumbs";
import { VaneBarButton, NotificationsBell, SearchTrigger } from "@/components/layout/app-bar-tools";
import { EmergencyHeaderTrigger } from "@/components/alerts/emergency-alert-host";
import { Button as KitButton, ButtonLink as KitButtonLink, Kit } from "@/components/core";
import { usePageChrome, type PagePrimary } from "@/components/layout/page-chrome";
import { useShellNav } from "@/components/layout/shell-nav";
import { ChromeIcon, NavIcon } from "@/components/layout/sidebar/parts";
import { NAV_ICONS } from "@/lib/icons/corelith-nav.generated";
import { useRecordStep } from "@/components/layout/use-record-step";
import { useShell } from "@/components/layout/shell-state";
import { Button } from "@/components/workspace/button";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/workspace/menu";
import { CrmMembers } from "@/components/crm/crm-members";
import { type LucideIcon } from "@/lib/icons";
import { VANE_PAGES } from "@/components/vane/vane-nav";
import { EXPLORE_NAV_ITEMS, navSections } from "@/lib/navigation";

import bar from "./app-bar.module.css";

/**
 * The icon the nav shows for this route, for a page outside the current
 * workspace's panel. Longest match wins: `/crm/leads` beats `/crm`.
 */
function routeIcon(pathname: string): LucideIcon | undefined {
  let best: { length: number; icon: LucideIcon } | undefined;
  // Explore and Vane are modules of their own, in no declared section.
  for (const section of [...navSections, { items: EXPLORE_NAV_ITEMS }, { items: VANE_PAGES }]) {
    for (const item of section.items) {
      const path = item.href.split("?")[0] ?? item.href;
      if (pathname !== path && !pathname.startsWith(`${path}/`)) continue;
      if (!best || path.length > best.length) best = { length: path.length, icon: item.icon };
    }
  }
  return best?.icon;
}

/** Where a primary goes when it names a sheet: this page, with `?sheet=<kind>`. */
function sheetHref(pathname: string, search: string, sheet: string) {
  const params = new URLSearchParams(search);
  params.set("sheet", sheet);
  return `${pathname}?${params.toString()}`;
}

/** The shortcut a primary shows and answers to: its own, or N for a New. */
function primaryShortcut(primary: PagePrimary | null): string | undefined {
  if (!primary || primary.disabled || primary.busy || primary.menu?.length) return undefined;
  return primary.shortcut ?? (primary.icon === "plus" ? "N" : undefined);
}

/**
 * The app bar (the App bar page of the navigation canvas): 56px, the page's
 * icon, its parent and title, its reference, the previous and next record with
 * the position; then its actions, its one primary, the emergency signal and
 * the three tools that never move: Vane, search and notifications.
 *
 * Under 720px it is the same bar folded: the menu (or back, on a record), a
 * 17px title, the tools as 44px icons, ⋯ for the folded actions and the
 * primary as a plus. On a record the tools give way to ⋯.
 */
export function PageHeader() {
  const { actions, identity, primary, phoneMenu } = usePageChrome();
  const nav = useShellNav();
  const shell = useShell();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();

  const title = (identity?.title && identity.title.trim().length > 0)
    ? identity.title
    : (nav.pageLabel ?? getCurrentPageTitle(pathname, searchParams.get("view")));
  const back = identity?.back;
  // A record opened from a list steps to its neighbours in it.
  const step = useRecordStep(Boolean(identity?.back));
  const primaryHref =
    primary?.href ?? (primary?.sheet ? sheetHref(pathname, searchParams.toString(), primary.sheet) : null) ?? primary?.menu?.[0]?.href ?? null;
  const runPrimary = (target: PagePrimary) => {
    if (target.disabled || target.busy) return;
    if (target.onClick) target.onClick();
    else if (primaryHref) router.push(primaryHref);
  };
  const folded = phoneMenu ? [] : flatten(actions);
  // On a phone a create action is the plus; a verb ("Count and close") leads ⋯.
  const primaryInMenu = primary && primary.icon !== "plus" ? primary : null;
  const menuCount = folded.length + (phoneMenu?.length ?? 0) + (primaryInMenu ? 1 : 0);
  // Held lowercase and drawn with `createElement`: a capitalised binding read
  // during render looks to the lint rule like a component made in render.
  const pageIconName = nav.pageIcon;
  const pageIcon: ElementType | undefined = pageIconName && NAV_ICONS[pageIconName] ? undefined : routeIcon(pathname);
  const showMembers = pathname === "/crm" || pathname.startsWith("/crm/");

  return (
    // 56px with its bottom line, plus the notch on a phone.
    <header className="box-border h-[calc(56px+env(safe-area-inset-top))] flex-none bg-[var(--surface)] pt-[env(safe-area-inset-top)] shadow-[inset_0_-1px_0_var(--line)]">
      {/* ≥720px */}
      <div className={bar.bar}>
        <div className={bar.left}>
          <h1 className={bar.crumb}>
            {identity?.icon ? identity.icon : pageIconName && NAV_ICONS[pageIconName] ? (
              <NavIcon name={pageIconName} className={bar.pg} />
            ) : pageIcon ? (
              createElement(pageIcon, { className: bar.pg, "aria-hidden": true })
            ) : null}
            {back ? (
              <>
                <Link href={back.href} className={bar.par}>
                  {back.label}
                </Link>
                {title ? (
                  <span aria-hidden="true" className={bar.sl}>
                    /
                  </span>
                ) : null}
              </>
            ) : null}
            <span className={bar.title}>{title}</span>
          </h1>
          {identity?.reference ? <span className={bar.ref}>{identity.reference}</span> : null}
          {identity?.picker ? (
            identity.picker.options.length > 1 ? (
              <Menu>
                <MenuTrigger asChild>
                  <button type="button" className={bar.pick}>
                    {identity.picker.label}
                    <ChromeIcon name="next" className={bar.ic12} />
                  </button>
                </MenuTrigger>
                <MenuContent align="start" style={{ minWidth: 232 }}>
                  {identity.picker.options.map((option) => (
                    <MenuItem key={option.key} onSelect={() => router.push(option.href)}>
                      {option.label}
                    </MenuItem>
                  ))}
                </MenuContent>
              </Menu>
            ) : (
              <span className={bar.pick} style={{ cursor: "default" }}>
                {identity.picker.label}
              </span>
            )
          ) : null}
          {step ? (
            <span className={bar.step} role="group" aria-label={`Move between ${back?.label.toLowerCase() ?? "records"}`}>
              <button type="button" className={bar.tool} aria-label="Previous record, K" aria-keyshortcuts="K" disabled={!step.previous} onClick={step.previous ?? undefined}>
                <ChromeIcon name="previous" className={bar.ic} />
              </button>
              <button type="button" className={bar.tool} aria-label="Next record, J" aria-keyshortcuts="J" disabled={!step.next} onClick={step.next ?? undefined}>
                <ChromeIcon name="next" className={bar.ic} />
              </button>
              <span className={bar.pos}>
                {step.position} of {step.total}
              </span>
            </span>
          ) : null}
          {identity?.sub ? <span className={bar.sub}>{identity.sub}</span> : null}
          {identity?.subLink ? (
            <Link href={identity.subLink.href} className={bar.subLink}>
              {identity.subLink.label}
            </Link>
          ) : null}
        </div>
        <div className={bar.right}>
          {showMembers ? <CrmMembers /> : null}
          {actions ? <div className={bar.right}>{actions}</div> : null}
          {primary ? <Primary primary={primary} href={primaryHref} onRun={() => runPrimary(primary)} /> : null}
          <EmergencyHeaderTrigger />
          <VaneBarButton />
          <SearchTrigger />
          <NotificationsBell />
        </div>
      </div>

      {/* <720px */}
      <div className={bar.phone}>
        {back ? (
          <Link href={back.href} aria-label={`Back to ${back.label}`} className={bar.tool}>
            <ChromeIcon name="back" className={bar.ic20} />
          </Link>
        ) : (
          <button type="button" aria-label="Menu" aria-expanded={shell.drawerOpen} onClick={() => shell.setDrawerOpen(!shell.drawerOpen)} className={bar.tool}>
            <ChromeIcon name="menu" className={bar.ic20} />
          </button>
        )}
        <h1 className={bar.phoneTitle}>{title}</h1>
        {back ? null : (
          <>
            <EmergencyHeaderTrigger compact />
            <VaneBarButton />
            <SearchTrigger />
            <NotificationsBell />
          </>
        )}
        {menuCount > 0 ? (
          <Menu>
            <MenuTrigger asChild>
              <button type="button" aria-label="More actions" className={bar.tool}>
                <ChromeIcon name="more" className={bar.ic20} />
              </button>
            </MenuTrigger>
            <MenuContent align="end" style={{ minWidth: 232 }}>
              {primaryInMenu ? (
                <MenuItem className="font-semibold" disabled={Boolean(primaryInMenu.disabled || primaryInMenu.busy)} sub={primaryInMenu.disabled} onSelect={() => runPrimary(primaryInMenu)}>
                  {primaryInMenu.label}
                </MenuItem>
              ) : null}
              {phoneMenu?.map((item) => (
                <MenuItem key={item.key} danger={item.danger} sub={item.sub} onSelect={item.onSelect}>
                  {item.label}
                </MenuItem>
              ))}
              {folded.length ? <div className="flex flex-col gap-1 p-1 [&_a]:w-full [&_button]:w-full">{folded}</div> : null}
            </MenuContent>
          </Menu>
        ) : null}
        {primary?.menu?.length ? (
          <Menu>
            <MenuTrigger asChild>
              <button type="button" aria-label={primary.label} className={bar.plus}>
                <ChromeIcon name="add" className={bar.ic20} />
              </button>
            </MenuTrigger>
            <MenuContent align="end" style={{ minWidth: 232 }}>
              {primary.menu.map((item) => (
                <MenuItem key={item.href} icon={<ChromeIcon name="add" />} onSelect={() => router.push(item.href)}>
                  {item.label}
                </MenuItem>
              ))}
            </MenuContent>
          </Menu>
        ) : primary && !primaryInMenu ? (
          <button
            type="button"
            aria-label={primary.disabled ? `${primary.label}: ${primary.disabled}` : primary.label}
            title={primary.disabled}
            disabled={Boolean(primary.disabled || primary.busy)}
            onClick={() => runPrimary(primary)}
            className={bar.plus}
          >
            <ChromeIcon name="add" className={bar.ic20} />
          </button>
        ) : null}
      </div>
    </header>
  );
}

/**
 * The page's one filled button, in every state the App bar page draws: at
 * rest, with a menu behind its chevron, working (a spinner, the label kept),
 * and held, greyed in place with its reason on hover and to a screen reader.
 */
function Primary({ primary, href, onRun }: { primary: PagePrimary; href: string | null; onRun: () => void }) {
  const router = useRouter();
  if (primary.disabled) {
    return (
      <span title={primary.disabled} className="inline-flex">
        <Button variant="primary" disabled aria-description={primary.disabled} className={bar.held}>
          {primary.label}
        </Button>
      </span>
    );
  }
  if (primary.busy) {
    return (
      <Button variant="primary" aria-busy="true" className={bar.busy} onClick={(event) => event.preventDefault()}>
        <span className={bar.spin} aria-hidden="true" />
        {primary.label}
      </Button>
    );
  }
  const main = (
    <Kit contents>
      {href && !primary.onClick && !primary.menu?.length ? (
        <KitButtonLink href={href} variant="primary" icon={primary.icon} shortcut={primaryShortcut(primary)}>
          {primary.label}
        </KitButtonLink>
      ) : (
        <KitButton variant="primary" icon={primary.icon} shortcut={primaryShortcut(primary)} onClick={onRun}>
          {primary.label}
        </KitButton>
      )}
    </Kit>
  );
  if (!primary.menu?.length) return main;
  return (
    <span className={bar.split}>
      {main}
      <Menu>
        <MenuTrigger asChild>
          <Button variant="primary" aria-label="More ways to create">
            <ChromeIcon name="next" className={bar.ic12} />
          </Button>
        </MenuTrigger>
        <MenuContent align="end" style={{ minWidth: 232 }}>
          {primary.menu.map((item) => (
            <MenuItem key={item.href} icon={<ChromeIcon name="add" />} onSelect={() => router.push(item.href)}>
              {item.label}
            </MenuItem>
          ))}
        </MenuContent>
      </Menu>
    </span>
  );
}

/** The page's actions as a flat list, for the phone's ⋯. */
function flatten(actions: ReactNode): ReactElement[] {
  const flattened: ReactElement[] = [];
  const collect = (node: ReactNode) => {
    Children.forEach(node, (child) => {
      if (!isValidElement<{ children?: ReactNode }>(child)) return;
      if (child.type === Fragment || child.type === "div" || child.type === "span") {
        collect(child.props.children);
        return;
      }
      flattened.push(child);
    });
  };
  collect(actions);
  return flattened;
}
