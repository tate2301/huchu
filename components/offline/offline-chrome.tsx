"use client";

import { usePathname } from "next/navigation";

import { OfflineBanner } from "@/components/offline/offline-banner";

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

  /*
    The strip is the one piece of offline chrome that stays: 40px, shown only
    while the line is down, and the one thing a person needs interrupting for.
    Everything else is behind the sync word in the sidebar foot and the till's
    sync button, which open Device sync.
  */
  return <OfflineBanner />;
}
