"use client";

import {
  Children,
  createElement,
  Fragment,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { getCurrentPageTitle } from "@/components/layout/breadcrumbs";
import {
  DeviceStatus,
  NotificationsBell,
  SearchTrigger,
  SidebarToggle,
} from "@/components/layout/app-bar-tools";
import { usePageChrome, type PagePrimary } from "@/components/layout/page-chrome";
import { useShellNav } from "@/components/layout/shell-nav";
import { useShell } from "@/components/layout/shell-state";
import { Button } from "@/components/workspace/button";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/workspace/menu";
import { CrmMembers } from "@/components/crm/crm-members";
import { CaretLeft, DotsThree, List, Plus, type LucideIcon } from "@/lib/icons";
import { navSections } from "@/lib/navigation";

/**
 * The icon the nav shows for this route, for a page outside the current
 * workspace's panel. Longest match wins: `/crm/leads` beats `/crm`.
 */
function routeIcon(pathname: string): LucideIcon | undefined {
  let best: { length: number; icon: LucideIcon } | undefined;
  for (const section of navSections) {
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

/**
 * The 48px app bar (00-foundations 5.3.5, and the bar the app had before it):
 * the sidebar toggle, back link, the page's icon and title, reference or sub
 * and sub link; then, on the right, the CRM's members, Search (⌘K), the
 * device's sync state, the notifications bell with its unread count, the
 * page's own actions and its one primary. Search and notifications are also in
 * the account menu.
 *
 * Below 720px it is "≡ <title> search, device, bell, ⋯ +": the menu button
 * opens the drawer and a create primary becomes a 44px plus; a verb primary
 * leads ⋯, and the page's other actions fold into ⋯ (as the page's
 * `phoneMenu` items when it gives them).
 */
export function PageHeader() {
  const { actions, identity, primary, phoneMenu } = usePageChrome();
  const nav = useShellNav();
  const shell = useShell();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();

  const title = identity?.title ?? nav.pageLabel ?? getCurrentPageTitle(pathname, searchParams.get("view"));
  const back = identity?.back;
  const primaryHref = primary?.href ?? (primary?.sheet ? sheetHref(pathname, searchParams.toString(), primary.sheet) : null);
  const runPrimary = (target: PagePrimary) => {
    if (target.onClick) target.onClick();
    else if (primaryHref) router.push(primaryHref);
  };
  const folded = phoneMenu ? [] : flatten(actions);
  // On a phone a create action is the plus; a verb ("Count and close") leads ⋯.
  const primaryInMenu = primary && primary.icon !== "plus" ? primary : null;
  const menuCount = folded.length + (phoneMenu?.length ?? 0) + (primaryInMenu ? 1 : 0);
  // Held lowercase and drawn with `createElement`: a capitalised binding read
  // during render looks to the lint rule like a component made in render.
  const pageIcon = nav.activeItem?.icon ?? routeIcon(pathname);
  const showMembers = pathname === "/crm" || pathname.startsWith("/crm/");

  return (
    // 48px with its bottom border (border-box), plus the notch on a phone.
    <header className="box-border h-[calc(48px+env(safe-area-inset-top))] flex-none border-b border-[var(--line)] bg-[var(--surface)] pt-[env(safe-area-inset-top)]">
      {/* ≥720px */}
      <div className="flex h-full items-center gap-2.5 pl-2.5 pr-4 max-[719px]:hidden">
        <SidebarToggle />
        {back ? (
          <>
            <Link
              href={back.href}
              aria-label={`Back to ${back.label}`}
              className="flex h-8 shrink-0 items-center gap-1 rounded-[8px] pl-1 pr-2 text-[var(--ink-3)] no-underline hover:bg-[var(--hover)]"
            >
              <CaretLeft className="size-4" aria-hidden="true" />
              {back.label}
            </Link>
            {title ? (
              <span aria-hidden="true" className="text-[var(--line-strong)]">
                /
              </span>
            ) : null}
          </>
        ) : null}
        {pageIcon && !back
          ? createElement(pageIcon, { className: "size-4 shrink-0 text-[var(--ink-3)]", "aria-hidden": true })
          : null}
        <h1 className="m-0 min-w-0 truncate text-[15px] font-semibold text-[var(--ink)]">{title}</h1>
        {identity?.reference ? (
          <span className="shrink-0 font-mono text-[var(--ink-3)]" style={{ fontSize: 12 }}>
            {identity.reference}
          </span>
        ) : null}
        {identity?.sub ? (
          <span className="min-w-0 truncate text-[var(--ink-3)]">{identity.sub}</span>
        ) : null}
        {identity?.subLink ? (
          <Link
            href={identity.subLink.href}
            className="shrink-0 whitespace-nowrap text-[var(--ink)] underline decoration-[var(--line-strong)] underline-offset-[3px]"
          >
            {identity.subLink.label}
          </Link>
        ) : null}
        <div className="flex-1" />
        <div className="flex shrink-0 items-center gap-1">
          {showMembers ? <CrmMembers className="mr-1" /> : null}
          <SearchTrigger />
          <DeviceStatus />
          <NotificationsBell />
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
        {primary ? (
          primaryHref && !primary.onClick ? (
            <Button asChild variant="primary">
              <Link href={primaryHref}>
                {primary.icon === "plus" ? <Plus className="size-3.5" aria-hidden="true" /> : null}
                {primary.label}
              </Link>
            </Button>
          ) : (
            <Button
              variant="primary"
              icon={primary.icon === "plus" ? <Plus className="size-3.5" aria-hidden="true" /> : undefined}
              onClick={() => runPrimary(primary)}
            >
              {primary.label}
            </Button>
          )
        ) : null}
      </div>

      {/* <720px (Mobile board) */}
      <div className="flex h-full items-center gap-1 pl-1 pr-1 min-[720px]:hidden">
        <button
          type="button"
          aria-label="Open the menu"
          onClick={() => shell.setDrawerOpen(true)}
          className="flex size-11 shrink-0 items-center justify-center rounded-[8px] text-[var(--ink-2)]"
        >
          <List weight="bold" className="size-5" aria-hidden="true" />
        </button>
        <h1 className="m-0 min-w-0 flex-1 truncate text-[16px] font-semibold text-[var(--ink)]">{title}</h1>
        <SearchTrigger compact />
        <DeviceStatus compact />
        <NotificationsBell compact />
        {menuCount > 0 ? (
          <Menu>
            <MenuTrigger asChild>
              <button
                type="button"
                aria-label="More actions"
                className="flex size-11 shrink-0 items-center justify-center rounded-[8px] text-[var(--ink-2)]"
              >
                <DotsThree weight="regular" className="size-5" aria-hidden="true" />
              </button>
            </MenuTrigger>
            <MenuContent align="end">
              {primaryInMenu ? (
                <MenuItem className="font-semibold" onSelect={() => runPrimary(primaryInMenu)}>
                  {primaryInMenu.label}
                </MenuItem>
              ) : null}
              {phoneMenu?.map((item) => (
                <MenuItem key={item.key} danger={item.danger} sub={item.sub} onSelect={item.onSelect}>
                  {item.label}
                </MenuItem>
              ))}
              {folded.length ? (
                <div className="flex flex-col gap-1 p-1 [&_a]:w-full [&_button]:w-full">{folded}</div>
              ) : null}
            </MenuContent>
          </Menu>
        ) : null}
        {primary && !primaryInMenu ? (
          <button
            type="button"
            aria-label={primary.label}
            onClick={() => runPrimary(primary)}
            className="flex size-11 shrink-0 items-center justify-center rounded-[8px] text-[var(--action)]"
          >
            <Plus className="size-[22px]" aria-hidden="true" />
          </button>
        ) : null}
      </div>
    </header>
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
