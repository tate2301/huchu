"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";

import {
  Breadcrumbs,
  getCurrentPageTitle,
} from "@/components/layout/breadcrumbs";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { usePageActions } from "@/components/layout/page-actions";
import { OfflineStatusIndicator } from "@/components/layout/offline-status-indicator";
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

  const isScrapRoute = pathname.startsWith("/scrap-metal");
  const currentTitle = getCurrentPageTitle(pathname, view);
  const successHint = getSuccessHint(pathname);

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
            <OfflineStatusIndicator />
            {showNotificationCenter ? <NotificationCenter /> : null}
            {actions ? (
              <div className="flex items-center gap-2 [&>*:nth-child(n+3)]:hidden">
                {actions}
              </div>
            ) : null}
          </div>
          <div className="hidden h-14 items-center gap-3 md:flex">
            <SidebarTrigger />
            <Separator orientation="vertical" className="h-6" />
            <div className="min-w-0">
              <Breadcrumbs />
            </div>
            <div className="ml-auto flex items-center gap-3">
              <OfflineStatusIndicator />
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

function getSuccessHint(pathname: string) {
  const hints: Array<{ prefix: string; hint: string }> = [
    {
      prefix: "/shift-report",
      hint: "Success: report is submitted and highlighted in the table.",
    },
    {
      prefix: "/attendance",
      hint: "Success: today's attendance batch appears in the records list.",
    },
    {
      prefix: "/plant-report",
      hint: "Success: report appears in the list for the selected date range.",
    },
    {
      prefix: "/stores",
      hint: "Success: stock action appears in the movement log.",
    },
    {
      prefix: "/gold",
      hint: "Success: the saved gold record appears in history below the form.",
    },
  ];

  return hints.find((entry) => pathname.startsWith(entry.prefix))?.hint ?? null;
}
