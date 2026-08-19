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
import { ButtonGroup } from "@/components/ui/button-group";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { IconButton } from "@/components/ui/icon-button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { usePageChrome } from "@/components/layout/page-chrome";
import { GlobalCommandBar } from "@/components/layout/command-bar/global-command-bar";
import { OfflineStatusButton } from "@/components/layout/offline-status-button";
import { CrmMembers } from "@/components/crm/crm-members";
import { NotificationCenter } from "@/components/notifications/notification-center";
import { ArrowLeft, MoreHorizontal, type LucideIcon } from "@/lib/icons";
import { navSections } from "@/lib/navigation";
import { canAccessCapabilityWithToken } from "@/lib/platform/gating/token-check";

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
    <header className="sticky top-0 z-20 border-b border-[var(--chrome-edge)] bg-surface-base pt-[env(safe-area-inset-top)]">
      <div className="px-2 h-14 lg:pr-4">
        <>
          <div className="flex h-14 items-center gap-1.5 md:hidden">
            <SidebarTrigger />
            <div className="flex min-w-0 flex-1 items-center gap-1.5">
              {back ? (
                <Link
                  href={back.href}
                  aria-label={`Back to ${back.label}`}
                  className="-ml-1 flex size-7 shrink-0 items-center justify-center rounded-[var(--radius-sm)] text-[var(--text-muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--text)]"
                >
                  <ArrowLeft className="size-4" />
                </Link>
              ) : null}
              {pageIcon
                ? createElement(pageIcon, {
                    className: "h-4 w-4 shrink-0 text-[var(--text-muted)]",
                    "aria-hidden": true,
                  })
                : null}
              <h1 className="truncate text-sm font-semibold text-foreground">{title}</h1>
            </div>
            <GlobalCommandBar />
            <OfflineStatusButton />
            {showNotificationCenter ? <NotificationCenter /> : null}
            <MobileNavbarActions actions={actions} />
          </div>

          <div className="hidden h-14 items-center gap-3 md:flex justify-between">
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

function MobileNavbarActions({ actions }: { actions: ReactNode }) {
  const flattenedActions = flattenNavbarActions(actions);

  if (flattenedActions.length === 0) {
    return null;
  }

  if (flattenedActions.length === 1) {
    return <div className="flex items-center">{flattenedActions[0]}</div>;
  }

  const [primaryAction, ...overflowActions] = flattenedActions;

  return (
    <ButtonGroup className="shrink-0">
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
    </ButtonGroup>
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
