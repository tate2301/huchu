"use client";

import { useSearchParams } from "next/navigation";

import { StoresShell } from "@corelithzw/module-stock/components/stores-shell";
import { StockMovementsFeed } from "@corelithzw/module-stock/components/stock-movements-feed";

export default function StoresMovementsPage() {
  const siteId = useSearchParams().get("siteId") ?? undefined;

  return (
    <StoresShell activeTab="movements">
      <StockMovementsFeed siteId={siteId} />
    </StoresShell>
  );
}
