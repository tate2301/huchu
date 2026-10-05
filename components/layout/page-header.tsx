"use client";

import {
  Children,
  Fragment,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { getCurrentPageTitle } from "@/components/layout/breadcrumbs";
import { usePageChrome, type PagePrimary } from "@/components/layout/page-chrome";
import { useShellNav } from "@/components/layout/shell-nav";
import { useShell } from "@/components/layout/shell-state";
import { Button } from "@/components/workspace/button";
import { Menu, MenuContent, MenuTrigger } from "@/components/workspace/menu";
import { CaretLeft, DotsThree, List, Plus } from "@/lib/icons";

/** Where a primary goes when it names a sheet: this page, with `?sheet=<kind>`. */
function sheetHref(pathname: string, search: string, sheet: string) {
  const params = new URLSearchParams(search);
  params.set("sheet", sheet);
  return `${pathname}?${params.toString()}`;
}

/**
 * The 48px page header (00-foundations 5.3.5): back link, title, reference or
 * sub and sub link, then the page's own actions and its one primary. No search
 * box, bell or device icon: those live in the account menu now.
 *
 * Below 720px it is "≡ <title> +": the menu button opens the drawer and the
 * primary becomes a 44px plus; the page's other actions fold into ⋯.
 */
export function PageHeader() {
  const { actions, identity, primary } = usePageChrome();
  const nav = useShellNav();
  const shell = useShell();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();

  const title = identity?.title ?? nav.activeItem?.label ?? getCurrentPageTitle(pathname, searchParams.get("view"));
  const back = identity?.back;
  const primaryHref = primary?.href ?? (primary?.sheet ? sheetHref(pathname, searchParams.toString(), primary.sheet) : null);
  const runPrimary = (target: PagePrimary) => {
    if (target.onClick) target.onClick();
    else if (primaryHref) router.push(primaryHref);
  };
  const folded = flatten(actions);

  return (
    // 48px with its bottom border (border-box), plus the notch on a phone.
    <header className="box-border h-[calc(48px+env(safe-area-inset-top))] flex-none border-b border-[var(--line)] bg-[var(--surface)] pt-[env(safe-area-inset-top)]">
      {/* ≥720px */}
      <div className="flex h-full items-center gap-2.5 px-4 max-[719px]:hidden">
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
            <span aria-hidden="true" className="text-[var(--line-strong)]">
              /
            </span>
          </>
        ) : null}
        <h1 className="m-0 min-w-0 truncate text-[15px] font-semibold text-[var(--ink)]">{title}</h1>
        {identity?.reference ? (
          <span className="shrink-0 font-mono text-[var(--ink-3)]" style={{ fontSize: 12 }}>
            {identity.reference}
          </span>
        ) : null}
        {identity?.sub ? (
          <span className="min-w-0 truncate text-[var(--ink-3)]">{identity.sub}</span>
        ) : null}
        {identity?.sub && identity.subLink ? (
          <Link
            href={identity.subLink.href}
            className="shrink-0 whitespace-nowrap text-[var(--ink)] underline decoration-[var(--line-strong)] underline-offset-[3px]"
          >
            {identity.subLink.label}
          </Link>
        ) : null}
        <div className="flex-1" />
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
        {folded.length > 0 ? (
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
              <div className="flex flex-col gap-1 p-1 [&_a]:w-full [&_button]:w-full">{folded}</div>
            </MenuContent>
          </Menu>
        ) : null}
        {primary ? (
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
