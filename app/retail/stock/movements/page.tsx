"use client";

import { useSearchParams } from "next/navigation";

import { RetailShell } from "@/components/retail/retail-shell";
import { StockMovementsFeed } from "@/components/stores/stock-movements-feed";

/**
 * Stock › Movements — every bottle in and out, newest first.
 *
 * The same feed the stores module reads, drawn in the retail frame so a shop
 * never leaves its own sidebar to answer "where did those go".
 */
export default function RetailStockMovementsPage() {
  const searchParams = useSearchParams();

  return (
    <RetailShell title="Movements">
      <StockMovementsFeed
        siteId={searchParams.get("siteId") ?? undefined}
        initialSearch={searchParams.get("q") ?? ""}
      />
    </RetailShell>
  );
}
