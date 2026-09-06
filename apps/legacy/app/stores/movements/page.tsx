"use client";

import { useSearchParams } from "next/navigation";

import { StoresShell } from "@/components/stores/stores-shell";
import { StockMovementsFeed } from "@/components/stores/stock-movements-feed";

export default function StoresMovementsPage() {
  const siteId = useSearchParams().get("siteId") ?? undefined;

  return (
    <StoresShell activeTab="movements">
      <StockMovementsFeed siteId={siteId} />
    </StoresShell>
  );
}
