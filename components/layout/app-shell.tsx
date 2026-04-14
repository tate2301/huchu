"use client";

import * as React from "react";
import { usePathname } from "next/navigation";

import { Navbar } from "@/components/layout/navbar";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { PageActionsProvider } from "@/components/layout/page-actions";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { OnboardingProvider } from "@/components/onboarding/onboarding-provider";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAuthRoute = pathname === "/login";
  const isMarketingRoute =
    pathname === "/home" || pathname.startsWith("/home/");
  const isPortalRoute = pathname.startsWith("/portal/");
  const isAdminRoute = pathname.startsWith("/admin");
  const isCctvRoute = pathname.startsWith("/cctv");
  const isScrapRoute = pathname.startsWith("/scrap-metal");

  if (isAuthRoute || isMarketingRoute || isPortalRoute || isAdminRoute) {
    return <div className="min-h-screen bg-background">{children}</div>;
  }

  return (
    <PageActionsProvider>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset className="m-2 flex min-h-screen flex-col rounded-xl border bg-surface-base shadow-sm overflow-visible md:overflow-clip">
          <Navbar />
          <main
            className={
              isCctvRoute
                ? "min-w-0 flex-1  py-0"
                : isScrapRoute
                  ? "content-shell min-w-0 flex-1 overflow-visible md:overflow-hidden py-4 md:py-6"
                  : "content-shell min-w-0 flex-1  py-6"
            }
          >
            <OnboardingProvider>{children}</OnboardingProvider>
          </main>
        </SidebarInset>
      </SidebarProvider>
    </PageActionsProvider>
  );
}
