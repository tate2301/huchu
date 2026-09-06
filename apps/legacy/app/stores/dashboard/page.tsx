"use client";

import { useSearchParams } from "next/navigation";

import { StoresShell } from "@corelithzw/module-stock/components/stores-shell";
import { StockOverview } from "@corelithzw/module-stock/components/stock-overview";

export default function StoresDashboardPage() {
  const siteId = useSearchParams().get("siteId") ?? undefined;

  return (
    <StoresShell activeTab="dashboard" title="Stock overview">
      <StockOverview siteId={siteId} />
    </StoresShell>
  );
}
