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
    Two of the three pieces that used to live here are gone product-wide.

    The runtime banner was a ~120px block in the document flow reporting the
    progress of a cache warm nobody can hurry, and the floating pill was pinned
    bottom-right at `z-70` — on the POS terminal, directly over the keypad's
    backspace key. Both now live behind `OfflineStatusButton` in the navbar,
    which opens the full `OfflineRuntimePanel`: same information, plus queued
    counts and Sync now, none of it in the way.

    The connectivity strip stays. It is 40px, it appears only when the line is
    actually down, and unlike the other two it is the one thing a person needs
    interrupting for — an icon alone is too quiet to carry "you are offline" to
    somebody mid-task who is about to keep typing.
  */
  return <OfflineBanner />;
}
