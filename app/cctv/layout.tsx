"use client";

import { useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { CCTVShell, type CCTVTab } from "@/components/cctv/cctv-shell";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";

export default function CCTVLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  const activeTab = useMemo<CCTVTab>(() => {
    if (pathname.includes("/live")) return "live";
    if (pathname.includes("/nvrs")) return "nvrs";
    if (pathname.includes("/playback")) return "playback";
    if (pathname.includes("/access-logs")) return "access-logs";
    return "live";
  }, [pathname]);

  const navActions = activeTab === "live" ? (
    <ButtonGroup>
      <Button asChild variant="outline" size="sm">
        <Link href="/cctv/cameras/new">Register Camera</Link>
      </Button>
      <Button asChild variant="outline" size="sm">
        <Link href="/cctv/nvrs/new">Register NVR</Link>
      </Button>
    </ButtonGroup>
  ) : null;

  return <CCTVShell activeTab={activeTab} navActions={navActions}>{children}</CCTVShell>;
}
