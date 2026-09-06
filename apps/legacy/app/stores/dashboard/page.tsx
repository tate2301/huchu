"use client";

import { useSearchParams } from "next/navigation";

import { StoresShell } from "@/components/stores/stores-shell";
import { StockOverview } from "@/components/stores/stock-overview";

export default function StoresDashboardPage() {
  const siteId = useSearchParams().get("siteId") ?? undefined;

  return (
    <StoresShell activeTab="dashboard" title="Stock overview">
      <StockOverview siteId={siteId} />
    </StoresShell>
  );
}
