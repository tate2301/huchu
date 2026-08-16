"use client";

import * as React from "react";
import { usePathname } from "next/navigation";

import { Navbar } from "@/components/layout/navbar";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { PageChromeProvider } from "@/components/layout/page-chrome";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { OnboardingProvider } from "@/components/onboarding/onboarding-provider";
import { isPublicPath } from "@/lib/public-routes";

export function AppShell({
  children,
  hostPortalPath,
}: {
  children: React.ReactNode;
  hostPortalPath?: string | null;
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
  // A quote link, an intake form, a site brief: opened by a customer or a
  // courier who has no account here. Wrapping those in the workspace sidebar
  // showed them a navigation they cannot use and a tenant name that is none of
  // their business.
  const isPublicRoute = isPublicPath(pathname);
  const isCctvRoute = pathname.startsWith("/cctv");
  const isScrapRoute = pathname.startsWith("/scrap-metal");
  // The preview host control page. Drawing a workspace sidebar around it would
  // be drawing the workspace whose routing you are there to correct.
  const isPreviewHostRoute = pathname === "/preview-host";

  if (
    isAuthRoute ||
    isMarketingRoute ||
    isPortalRoute ||
    isAdminRoute ||
    isPublicRoute ||
    isPreviewHostRoute
  ) {
    return <div className="min-h-screen bg-background">{children}</div>;
  }

  return (
    <PageChromeProvider>
      <SidebarProvider>
        <AppSidebar />
        {/* Flat: no inset margin, rounding or gutter. The framed card read as a
            window floating over a desktop, which cost space on every side.
            What it does carry is one crisp hairline on the seam it shares with
            the sidebar — the boundary between navigation and work is real, and
            at `--border` on white it was invisible. Drawn here as an inset
            shadow rather than a border so it costs no layout width. */}
        <SidebarInset className="flex h-[100dvh] min-h-[100dvh] flex-col overflow-hidden bg-surface-base border-l border-(--chrome-edge)">
          <Navbar />
          <main
            className={
              isCctvRoute
                ? "min-w-0 min-h-0 flex-1 overflow-y-auto overscroll-contain [touch-action:pan-y] py-0"
                : isScrapRoute
                  ? "content-shell min-w-0 min-h-0 flex-1 overflow-y-auto overscroll-contain [touch-action:pan-y] pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] md:py-6"
                  : "content-shell min-w-0 min-h-0 flex-1 overflow-y-auto overscroll-contain [touch-action:pan-y] pt-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] md:py-6"
            }
          >
            <OnboardingProvider>{children}</OnboardingProvider>
          </main>
        </SidebarInset>
      </SidebarProvider>
    </PageChromeProvider>
  );
}
