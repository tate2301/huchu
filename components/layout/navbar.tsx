"use client";

import {
  Children,
  Fragment,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";

import {
  Breadcrumbs,
  getCurrentPageTitle,
} from "@/components/layout/breadcrumbs";
import { ButtonGroup } from "@/components/ui/button-group";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { usePageActions } from "@/components/layout/page-actions";
import { NotificationCenter } from "@/components/notifications/notification-center";
import { canAccessCapabilityWithToken } from "@/lib/platform/gating/token-check";

export function Navbar() {
  const { actions } = usePageActions();
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

  const currentTitle = getCurrentPageTitle(pathname, view);

  return (
    <header className="sticky top-0 z-20 h-14 max-h-14 bg-surface-base  backdrop-blur-md">
      <div className="px-2 h-14 lg:pr-4">
        <>
          <div className="flex h-14 items-center gap-2 md:hidden">
            <SidebarTrigger />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-foreground">
                {currentTitle}
              </p>
            </div>
            <MobileNavbarActions actions={actions} />
          </div>

          <div className="hidden h-14 items-center gap-3 md:flex justify-between">
            <div className="flex gap-3 items-center">
              <SidebarTrigger />
              <Separator orientation="vertical" className="h-6" />
              <div className="min-w-0">
                <Breadcrumbs />
              </div>
            </div>

            <div className="flex items-center gap-3">
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
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label="More actions"
          >
            <span className="material-symbols-rounded text-base">
              more_horiz
            </span>
          </Button>
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
