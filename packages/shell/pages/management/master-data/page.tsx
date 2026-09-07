"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useSession } from "next-auth/react";
import { Card } from "@corelithzw/react";
import { MasterDataShell } from "../../../master-data-shell";
import { getVisibleManagementAreaNavItems } from "../../../management";

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
      description="Operational reference data stays here. Workspace settings such as users, sites, and departments now live in Preferences."
    >
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {visibleItems.map((entry) => (
          <Link key={entry.href} href={entry.href} className="block h-full">
            {/* Card takes its header through props — it has no compound
                `.Header`/`.Title`/`.Body` slots in @corelithzw/react. */}
            <Card
              className="h-full transition-colors hover:border-[var(--brand)]"
              title={entry.label}
            >
              {entry.description ? (
                <p className="t-body t-muted">{entry.description}</p>
              ) : null}
            </Card>
          </Link>
        ))}
      </div>
    </MasterDataShell>
  );
}
