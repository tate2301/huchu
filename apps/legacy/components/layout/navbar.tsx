"use client";

import {
  Children,
  Fragment,
  createElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";

import { getCurrentPageTitle } from "@/components/layout/breadcrumbs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@corelithzw/ui/components/dropdown-menu";
import { IconButton } from "@corelithzw/ui/components/icon-button";
import { SidebarTrigger } from "@corelithzw/ui/components/sidebar";
import { usePageChrome } from "@/components/layout/page-chrome";
import { GlobalCommandBar } from "@/components/layout/command-bar/global-command-bar";
import { OfflineStatusButton } from "@/components/layout/offline-status-button";
import { CrmMembers } from "@/components/crm/crm-members";
import { NotificationCenter } from "@/components/notifications/notification-center";
import { ArrowLeft, MoreHorizontal, type LucideIcon } from "@corelithzw/ui/lib/icons";
import { navSections } from "@/lib/navigation";
import { cn } from "@corelithzw/ui/lib/utils";
import { canAccessCapabilityWithToken } from "@corelithzw/platform/gating/token-check";

/**
 * The icon the sidebar shows for this route, so a page that has not declared
 * its own identity still gets the same mark in the bar that it has in the nav.
 * Longest match wins — `/crm/leads` should beat `/crm`.
 */
function routeIcon(pathname: string): LucideIcon | undefined {
  let best: { length: number; icon: LucideIcon } | undefined;
  for (const section of navSections) {
    for (const item of section.items) {
      if (pathname !== item.href && !pathname.startsWith(`${item.href}/`)) continue;
      if (!best || item.href.length > best.length) {
        best = { length: item.href.length, icon: item.icon };
      }
    }
  }
  return best?.icon;
}

export function Navbar() {
  const { actions, identity } = usePageChrome();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const view = searchParams.get("view");
  const { data: session } = useSession();
  const enabledFeatures = (
    session?.user as { enabledFeatures?: string[] } | undefined
  )?.enabledFeatures;
  const showNotificationCenter = canAccessCapabilityWithToken(
    "notification.center.widget",
    enabledFeatures,
  ).allowed;

  const title = identity?.title ?? getCurrentPageTitle(pathname, view);
  // Held lowercase and rendered through `createElement`, the way the sidebar
  // does it: a capitalised binding assigned from a call reads to the lint rule
  // as a component defined during render, which would reset its state.
  const pageIcon = identity?.icon ?? routeIcon(pathname);
  const back = identity?.back;
  // The CRM is the one module that is genuinely a shared book, so it is the
  // one that shows you who else is in it.
  const showMembers = pathname === "/crm" || pathname.startsWith("/crm/");

  return (
    // Sticky, so it is genuinely floating over the scrolling content: a crisp
    // hairline plus a hard 1px shadow (no blur), not a soft glow.
    <header className="sticky top-0 z-[var(--z-nav)] border-b border-[var(--chrome-edge)] bg-surface-base pt-[env(safe-area-inset-top)] shadow-[var(--chrome-shadow)]">
      {/* The bar's own gutter is the content's, less the padding an icon
          button carries inside itself — so the first glyph sits on the same
          vertical line as the text below it rather than eight pixels inside
          it. That misalignment is most of what read as "inconsistent
          spacing": three different left edges down the top of every page. */}
      <div className="h-[var(--app-bar-h)] px-[calc(var(--content-gutter-x)-0.5rem)] lg:pr-4">
        <>
          <div className="flex h-[var(--app-bar-h)] items-center gap-1 md:hidden">
            <SidebarTrigger />
            <div className="flex min-w-0 flex-1 items-center gap-1.5">
              {back ? (
                <Link
                  href={back.href}
                  aria-label={`Back to ${back.label}`}
                  className="-ml-1 flex size-9 shrink-0 items-center justify-center rounded-[var(--radius-sm)] text-[var(--text-muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--text)]"
                >
                  <ArrowLeft className="size-4" />
                </Link>
              ) : null}
              {/* The icon gives way to the back arrow on a phone. A record
                  page carries both plus a primary action, and at 390px what
                  gave way instead was the record's own name — "Tena…" where
                  "Tenant billing portal" should be. The arrow says where you
                  are; the icon only repeats the type the identity strip
                  below already shows. */}
              {pageIcon && !back
                ? createElement(pageIcon, {
                    className: "h-4 w-4 shrink-0 text-[var(--text-muted)]",
                    "aria-hidden": true,
                  })
                : null}
              <h1 className="truncate text-sm font-semibold text-foreground">{title}</h1>
            </div>

            {/* Two clusters, not five loose controls. The quiet icons sit
                tight together so they read as one group of tools, and the
                page's own action is set apart from them by a wider gap —
                which is the only spacing in the row that means anything. */}
            <div className="flex shrink-0 items-center gap-0.5">
              <GlobalCommandBar />
              <OfflineStatusButton />
              {showNotificationCenter ? <NotificationCenter /> : null}
            </div>
            <MobileNavbarActions actions={actions} className="ml-1.5" />
          </div>

          <div className="hidden h-[var(--app-bar-h)] items-center gap-3 md:flex justify-between">
            <div className="flex min-w-0 items-center gap-2">
              <SidebarTrigger />
              {back ? (
                <Link
                  href={back.href}
                  className="ml-1 flex shrink-0 items-center gap-1 rounded-[var(--radius-sm)] px-1.5 py-1 text-sm text-[var(--text-muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--text)]"
                >
                  <ArrowLeft className="size-4" />
                  <span className="hidden lg:inline">{back.label}</span>
                </Link>
              ) : null}
              <div className="flex min-w-0 items-center gap-2 pl-1">
                {pageIcon
                  ? createElement(pageIcon, {
                      className: "h-[18px] w-[18px] shrink-0 text-[var(--text-muted)]",
                      "aria-hidden": true,
                    })
                  : null}
                <h1 className="truncate text-[15px] font-semibold text-foreground">{title}</h1>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              {showMembers ? <CrmMembers className="mr-1" /> : null}
              <GlobalCommandBar />
              <OfflineStatusButton />
              {showNotificationCenter ? <NotificationCenter /> : null}
              {actions ? (
                <div className="flex items-center gap-2">{actions}</div>
              ) : null}
            </div>
          </div>
        </>
      </div>
    </header>
  );
}

function MobileNavbarActions({
  actions,
  className,
}: {
  actions: ReactNode;
  className?: string;
}) {
  const flattenedActions = flattenNavbarActions(actions);

  if (flattenedActions.length === 0) {
    return null;
  }

  if (flattenedActions.length === 1) {
    return <div className={cn("flex items-center", className)}>{flattenedActions[0]}</div>;
  }

  const [primaryAction, ...overflowActions] = flattenedActions;

  return (
    // Two controls side by side, not a segmented group.
    // =================================================
    // `ButtonGroup` fences its children in a bordered, clipped box with a
    // divider between them — the right shape for a set of alternatives, and
    // the wrong one for "do the thing" plus "everything else". It put a solid
    // brand button and a bare icon button inside one outline, so the overflow
    // appeared to have a second border of its own and the pair read as one
    // control painted two colours.
    //
    // Loose, with the same gap the desktop bar uses, so the action row is one
    // shape at every width.
    <div className={cn("flex shrink-0 items-center gap-1.5", className)}>
      {primaryAction}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <IconButton size="lg" aria-label="More actions">
            <MoreHorizontal />
          </IconButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[14rem]">
          <div className="flex flex-col gap-1">
            {overflowActions.map((action, index) => (
              <div
                key={`${action.key ?? "action"}-${index}`}
                className="[&>[data-slot=button]]:w-full [&_a[data-slot=button]]:w-full"
              >
                {action}
              </div>
            ))}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function flattenNavbarActions(actions: ReactNode): ReactElement[] {
  const flattened: ReactElement[] = [];

  const collect = (node: ReactNode) => {
    Children.forEach(node, (child) => {
      if (!isValidElement(child)) {
        return;
      }

      if (child.type === Fragment) {
        // @ts-expect-error - child.props.children is ReactNode, but we know it's safe to pass to collect
        collect(child.props.children);
        return;
      }

      if (
        typeof child.type === "string" &&
        (child.type === "div" || child.type === "span")
      ) {
        // @ts-expect-error - child.props.children is ReactNode, but we know it's safe to pass to collect
        collect(child.props.children);
        return;
      }

      flattened.push(child);
    });
  };

  collect(actions);

  return flattened;
}
