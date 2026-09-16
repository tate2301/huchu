"use client";

import * as React from "react";
import { usePathname } from "next/navigation";

import { Navbar } from "@/components/layout/navbar";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { PageChromeProvider } from "@/components/layout/page-chrome";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { OnboardingProvider } from "@/components/onboarding/onboarding-provider";
import { isPublicPath } from "@/lib/public-routes";
import { RecordPeekProvider } from "@/components/records/record-peek";
import { RecordTrailProvider } from "@/components/records/record-trail";

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
            // One padding rule for every route now. The two exceptions were
            // CCTV (a full-bleed video wall, hence no vertical padding) and
            // scrap ticketing (a thumb-reachable bottom bar, hence a tighter
            // bottom inset); both modules are gone (ST-2.1, ST-2.3).
            // The work surface is the canvas tint, not white.
            // ============================================================
            // `SidebarInset` stays white because the app bar lives in it and
            // the bar is white in every artboard. But everything below the bar
            // is drawn on `--canvas` with white reserved for the things that
            // are actually raised off it: the rail, the view toolbar, and the
            // cards.
            //
            // On white it all collapsed into one field — a card's 1px
            // `--border` was the only thing separating a panel from the page,
            // so the layout read as a flat sheet with hairlines ruled on it
            // and nothing looked grouped. The tint is what makes a card a
            // card, and it costs one token.
            className="content-shell min-w-0 min-h-0 flex-1 overflow-y-auto overscroll-contain [touch-action:pan-y] bg-[var(--canvas)] pt-[var(--content-gutter-y)] pb-[max(1.5rem,env(safe-area-inset-bottom))] md:py-[var(--content-gutter-y)]"
          >
            {/* Both live above `main` rather than inside a page: the trail has
                to survive the navigation it is recording, and the peek has to
                render over the page it was opened from. */}
            <RecordTrailProvider>
              <RecordPeekProvider>
                <OnboardingProvider>
                  {/* The air under the app bar.
                      It is a wrapper rather than padding on `main` because
                      `main` is the scroll container: padding there moves the
                      scrollport edge every sticky band pins to, so the bands
                      lift off the bar and rows scroll through the gap beneath
                      them. That is why `--content-gutter-y` is 0 and has to
                      stay 0.
                      Inside a plain child the sticky bands still pin to
                      `main`, so the page gets its air at rest and the band
                      still sits flush against the bar once it pins. */}
                  <div className="pt-[var(--content-lede)]">{children}</div>
                </OnboardingProvider>
              </RecordPeekProvider>
            </RecordTrailProvider>
          </main>
        </SidebarInset>
      </SidebarProvider>
    </PageChromeProvider>
  );
}
