"use client";

import { useMemo } from "react";
import { usePathname } from "next/navigation";

import { CCTVShell, type CCTVTab } from "@/components/cctv/cctv-shell";

export default function CCTVLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  const activeTab = useMemo<CCTVTab>(() => {
    if (pathname.includes("/live")) return "live";
    if (pathname.includes("/cameras")) return "cameras";
    if (pathname.includes("/events")) return "events";
    if (pathname.includes("/nvrs")) return "nvrs";
    if (pathname.includes("/playback")) return "playback";
    if (pathname.includes("/access-logs")) return "access-logs";
    return "overview";
  }, [pathname]);

  return <CCTVShell activeTab={activeTab}>{children}</CCTVShell>;
}
