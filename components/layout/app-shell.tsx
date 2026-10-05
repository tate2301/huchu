"use client";

import * as React from "react";
import { usePathname } from "next/navigation";

import { AppSidebar } from "@/components/layout/app-sidebar";
import { GlobalCommandBar } from "@/components/layout/command-bar/global-command-bar";
import { MobileNav } from "@/components/layout/mobile-nav";
import { PageChromeProvider } from "@/components/layout/page-chrome";
import { PageHeader } from "@/components/layout/page-header";
import { RoleRefusal } from "@/components/layout/role-refusal";
import { ShellNavProvider, useShellNav, type WorkspaceBrand } from "@/components/layout/shell-nav";
import { ShellProvider, useShell } from "@/components/layout/shell-state";
import { OnboardingProvider } from "@/components/onboarding/onboarding-provider";
import { isPublicPath } from "@/lib/public-routes";
import { isSettingsSurfacePath } from "@/lib/settings/management-nav";
import { RecordPeekProvider } from "@/components/records/record-peek";
import { RecordTrailProvider } from "@/components/records/record-trail";

/**
 * The shell every signed-in page sits in (00-foundations 5.3.1):
 *
 *   rail 56 │ module panel 240 │ header 48 / the page
 *
 * Only the page's own scroll regions scroll; the header never does.
 */
export function AppShell({
  children,
  hostPortalPath,
  workspaceBrand,
  defaultPanelOpen = true,
}: {
  children: React.ReactNode;
  hostPortalPath?: string | null;
  workspaceBrand?: WorkspaceBrand | null;
  /** The `sidebar:state` cookie, read by the root layout. */
  defaultPanelOpen?: boolean;
}) {
  const pathname = usePathname();
  const isAuthRoute = pathname === "/login";
  // "/" is the marketing home on the marketing domain. On a tenant host the
  // root redirects before rendering, so it never reaches the shell.
  const isMarketingRoute =
    pathname === "/" || pathname === "/home" || pathname.startsWith("/home/");
  const isPortalRoute =
    pathname.startsWith("/portal/") ||
    hostPortalPath === "/portal/student" ||
    hostPortalPath === "/portal/parent" ||
    hostPortalPath === "/portal/teacher" ||
    hostPortalPath === "/portal/pos";
  const isAdminRoute = pathname.startsWith("/admin");
  // A quote link, an intake form, a site brief: opened by somebody with no
  // account here, who has no use for the workspace's navigation.
  const isPublicRoute = isPublicPath(pathname);
  // The preview host control page.
  const isPreviewHostRoute = pathname === "/preview-host";
  // Settings and preferences are a full-screen dialog of their own.
  const isSettingsRoute = isSettingsSurfacePath(pathname);

  if (
    isAuthRoute ||
    isMarketingRoute ||
    isPortalRoute ||
    isAdminRoute ||
    isPublicRoute ||
    isPreviewHostRoute ||
    isSettingsRoute
  ) {
    return <div className="min-h-screen bg-background">{children}</div>;
  }

  return (
    <ShellProvider defaultPanelOpen={defaultPanelOpen}>
      <ShellNavProvider brand={workspaceBrand}>
        <PageChromeProvider>
          <ShellFrame>{children}</ShellFrame>
        </PageChromeProvider>
      </ShellNavProvider>
    </ShellProvider>
  );
}

function ShellFrame({ children }: { children: React.ReactNode }) {
  const { width } = useShell();
  const { pending, refused, homeHref } = useShellNav();
  return (
    <div className="shell-frame flex h-[100dvh] overflow-hidden bg-[var(--ground)] text-[13px] text-[var(--ink)]">
      {width !== "phone" ? (
        <div className="flex h-full flex-none max-[719px]:hidden">
          <AppSidebar />
        </div>
      ) : null}
      <MobileNav />
      <GlobalCommandBar />
      <div className="flex min-w-0 flex-1 flex-col bg-[var(--surface)]">
        <PageHeader />
        <main className="content-shell min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain [touch-action:pan-y] pb-[env(safe-area-inset-bottom)]">
          {/* Both live above the page: the trail has to survive the navigation
              it is recording, and the peek renders over the page it was
              opened from. */}
          <RecordTrailProvider>
            <RecordPeekProvider>
              <OnboardingProvider>
                {/* The air under the header for pages not yet on a frame.
                    Padding on `main` would move the scrollport edge every
                    sticky band pins to, so it is a wrapper instead; full-bleed
                    bands cancel it (`globals.css`). */}
                <div className="pt-[var(--content-lede)]">
                  {pending ? null : refused ? <RoleRefusal homeHref={homeHref} /> : children}
                </div>
              </OnboardingProvider>
            </RecordPeekProvider>
          </RecordTrailProvider>
        </main>
      </div>
    </div>
  );
}
