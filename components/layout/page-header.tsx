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
  VaneBarButton,
  NotificationsBell,
  SearchTrigger,
} from "@/components/layout/app-bar-tools";
import { Button as KitButton, ButtonLink as KitButtonLink, Kit } from "@/components/core";
import { usePageChrome, type PagePrimary } from "@/components/layout/page-chrome";
import { useShellNav } from "@/components/layout/shell-nav";
import { useShell } from "@/components/layout/shell-state";
import { Button } from "@/components/workspace/button";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/workspace/menu";
import { CrmMembers } from "@/components/crm/crm-members";
import { CaretLeft, ChevronDown, DotsThree, List, Plus, type LucideIcon } from "@/lib/icons";
import { VANE_PAGES } from "@/components/vane/vane-nav";
import { EXPLORE_NAV_ITEMS, navSections } from "@/lib/navigation";

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
  if (!primary || primary.disabled || primary.menu?.length) return undefined;
  return primary.shortcut ?? (primary.icon === "plus" ? "N" : undefined);
}

/**
 * The 56px top bar (design/core-modules/spec/shell.md, `.tb-m`): the back
 * link, the page's icon and title, reference or sub and sub link; then
 * everything else in the right section (the owner, 19 Oct). Vane (its
 * button), search everything (Ctrl K) and the notifications bell with its
 * unread count are on every page and never move, at the far right; the CRM's
 * members, the page's own actions and its one primary appear to their left.
 * The device's sync state is in the account menu. The panel's own Hide
 * button and the rail hide and show the panel.
 *
 * Below 720px it is "≡ <title> Vane, search, bell, ⋯ +": the menu button
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
    if (target.disabled) return;
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
    // 56px with its bottom line, plus the notch on a phone.
    <header className="box-border h-[calc(56px+env(safe-area-inset-top))] flex-none bg-[var(--surface)] pt-[env(safe-area-inset-top)] shadow-[inset_0_-1px_0_var(--line)]">
      {/* ≥720px */}
      <div className="flex h-full items-center gap-3 px-6 max-[719px]:hidden">
        {/* The boards' crumb (`.tb-m h1`): the page's icon, the parent in grey as the way back, a faint slash, the record. */}
        <h1 className="m-0 flex min-w-0 items-center gap-2 text-[16px] font-semibold text-[var(--ink)]">
          {pageIcon ? createElement(pageIcon, { className: "size-4 shrink-0 text-[var(--ink-3)]", "aria-hidden": true }) : null}
          {back ? (
            <>
              <Link
                href={back.href}
                title={`Back to ${back.label}`}
                className="shrink-0 font-medium text-[var(--ink-3)] no-underline hover:text-[var(--ink)] hover:underline hover:underline-offset-[3px]"
              >
                {back.label}
              </Link>
              {title ? (
                <span aria-hidden="true" className="shrink-0 font-normal text-[var(--faint)]">
                  /
                </span>
              ) : null}
            </>
          ) : null}
          <span className="min-w-0 truncate">{title}</span>
        </h1>
        {identity?.reference ? (
          <span className="shrink-0 font-mono text-[var(--ink-3)]" style={{ fontSize: 12 }}>
            {identity.reference}
            {identity.picker ? " · " : null}
          </span>
        ) : null}
        {identity?.picker ? (
          identity.picker.options.length > 1 ? (
            <Menu>
              <MenuTrigger asChild>
                <button
                  type="button"
                  className="-ml-1.5 flex h-7 shrink-0 items-center gap-1 rounded-[6px] px-1 font-mono text-[var(--ink-3)] hover:bg-[var(--hover)] hover:text-[var(--ink)]"
                  style={{ fontSize: 12 }}
                >
                  {identity.picker.label}
                  <ChevronDown className="size-3" aria-hidden="true" />
                </button>
              </MenuTrigger>
              <MenuContent align="start">
                {identity.picker.options.map((option) => (
                  <MenuItem key={option.key} onSelect={() => router.push(option.href)}>
                    {option.label}
                  </MenuItem>
                ))}
              </MenuContent>
            </Menu>
          ) : (
            <span className="-ml-1.5 shrink-0 font-mono text-[var(--ink-3)]" style={{ fontSize: 12 }}>
              {identity.picker.label}
            </span>
          )
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
        <div className="flex shrink-0 items-center gap-2">
          {showMembers ? <CrmMembers className="mr-1" /> : null}
          {/* The page's actions and primary, left of the tools that never move. */}
          <div className="flex min-w-0 shrink-0 items-center gap-2">
            {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
            {primary?.menu?.length ? (
              <Menu>
                <MenuTrigger asChild>
                  <Button variant="primary" icon={primary.icon === "plus" ? <Plus className="size-3.5" aria-hidden="true" /> : undefined}>
                    {primary.label}
                  </Button>
                </MenuTrigger>
                <MenuContent align="end">
                  {primary.menu.map((item) => (
                    <MenuItem key={item.href} onSelect={() => router.push(item.href)}>
                      {item.label}
                    </MenuItem>
                  ))}
                </MenuContent>
              </Menu>
            ) : primary?.disabled ? (
              <span title={primary.disabled} className="inline-flex">
                <Button variant="primary" disabled aria-description={primary.disabled}>
                  {primary.label}
                </Button>
              </span>
            ) : primary ? (
              <Kit contents>
                {primaryHref && !primary.onClick ? (
                  <KitButtonLink
                    href={primaryHref}
                    variant="primary"
                    icon={primary.icon}
                    shortcut={primaryShortcut(primary)}
                  >
                    {primary.label}
                  </KitButtonLink>
                ) : (
                  <KitButton
                    variant="primary"
                    icon={primary.icon}
                    shortcut={primaryShortcut(primary)}
                    onClick={() => runPrimary(primary)}
                  >
                    {primary.label}
                  </KitButton>
                )}
              </Kit>
            ) : null}
          </div>
          <VaneBarButton />
          <SearchTrigger />
          <NotificationsBell />
        </div>
      </div>

      {/* <720px (Mobile board) */}
      <div className="flex h-full items-center gap-1 pl-1 pr-1 min-[720px]:hidden">
        {/* A record goes back to its list (BkInvoicePhone: ‹ INV-0131 ⋯); a page opens the menu. */}
        {back ? (
          <Link
            href={back.href}
            aria-label={`Back to ${back.label}`}
            className="flex size-11 shrink-0 items-center justify-center rounded-[8px] text-[var(--ink-2)]"
          >
            <CaretLeft weight="bold" className="size-5" aria-hidden="true" />
          </Link>
        ) : (
          <button
            type="button"
            aria-label="Open the menu"
            onClick={() => shell.setDrawerOpen(true)}
            className="flex size-11 shrink-0 items-center justify-center rounded-[8px] text-[var(--ink-2)]"
          >
            <List weight="bold" className="size-5" aria-hidden="true" />
          </button>
        )}
        <h1 className="m-0 min-w-0 flex-1 truncate text-[17px] font-semibold text-[var(--ink)]">{title}</h1>
        {back ? null : (
          <>
            <VaneBarButton />
            <SearchTrigger compact />
            <NotificationsBell compact />
          </>
        )}
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
                <MenuItem className="font-semibold" disabled={Boolean(primaryInMenu.disabled)} sub={primaryInMenu.disabled} onSelect={() => runPrimary(primaryInMenu)}>
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
        {primary?.menu?.length ? (
          <Menu>
            <MenuTrigger asChild>
              <button
                type="button"
                aria-label={primary.label}
                className="flex size-11 shrink-0 items-center justify-center rounded-[8px] text-[var(--action)]"
              >
                <Plus className="size-[22px]" aria-hidden="true" />
              </button>
            </MenuTrigger>
            <MenuContent align="end">
              {primary.menu.map((item) => (
                <MenuItem key={item.href} onSelect={() => router.push(item.href)}>
                  {item.label}
                </MenuItem>
              ))}
            </MenuContent>
          </Menu>
        ) : primary && !primaryInMenu ? (
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
