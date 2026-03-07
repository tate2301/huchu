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
  const isPortalRoute = pathname.startsWith("/portal/");

  if (isAuthRoute || isPortalRoute) {
    return <div className="min-h-screen bg-background">{children}</div>;
  }

  return (
    <PageActionsProvider>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset className="flex min-h-screen flex-col bg-background">
          <Navbar />
          <main className="content-shell min-w-0 flex-1 bg-background py-6">
            <OnboardingProvider>{children}</OnboardingProvider>
          </main>
        </SidebarInset>
      </SidebarProvider>
    </PageActionsProvider>
  );
}
