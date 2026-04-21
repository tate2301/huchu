"use client";

import { usePathname } from "next/navigation";

import { OfflineBanner } from "@/components/offline/offline-banner";
import { OfflineStatusIndicator } from "@/components/offline/offline-status-indicator";
import { OfflineRuntimeBanner } from "@/components/layout/offline-runtime-banner";

function shouldHideOfflineChrome(pathname: string) {
  return (
    pathname === "/login" ||
    pathname === "/offline" ||
    pathname === "/access-blocked" ||
    pathname === "/home" ||
    pathname.startsWith("/home/") ||
    pathname === "/admin" ||
    pathname.startsWith("/admin/") ||
    pathname === "/portal/admin" ||
    pathname.startsWith("/portal/admin/") ||
    pathname.endsWith("/login")
  );
}

export function OfflineChrome() {
  const pathname = usePathname();

  if (shouldHideOfflineChrome(pathname)) {
    return null;
  }

  return (
    <>
      <OfflineRuntimeBanner />
      <OfflineBanner />
      <div className="pointer-events-none fixed bottom-4 right-4 z-[70] sm:bottom-5 sm:right-5">
        <OfflineStatusIndicator className="pointer-events-auto" />
      </div>
    </>
  );
}
