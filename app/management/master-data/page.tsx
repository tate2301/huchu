"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useSession } from "next-auth/react";
import { MasterDataShell } from "@/components/management/master-data/master-data-shell";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getVisibleManagementAreaNavItems } from "@/lib/settings/management-nav";

export default function MasterDataOverviewPage() {
  const { data: session } = useSession();
  const enabledFeatures = useMemo(
    () => (session?.user as { enabledFeatures?: string[] } | undefined)?.enabledFeatures,
    [session],
  );
  const visibleItems = useMemo(
    () => getVisibleManagementAreaNavItems("master-data", enabledFeatures).filter((item) => item.id !== "overview"),
    [enabledFeatures],
  );

  return (
    <MasterDataShell
      activeTab="overview"
      title="Master Data"
    >
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {visibleItems.map((entry) => (
          <Link key={entry.href} href={entry.href} className="block">
            <Card className="h-full transition-colors hover:border-primary/40">
              <CardHeader>
                <CardTitle>{entry.label}</CardTitle>
                <CardDescription>{entry.description ?? `Manage ${entry.label.toLowerCase()} records.`}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </MasterDataShell>
  );
}
