"use client";

import { Suspense } from "react";

import { ListFrame } from "@/components/list-frame/list-frame";

/**
 * Stock › Counts (30-stock 5.5, W-22): every count with what it covers, who
 * counts it and how far it differs, drawn by ListFrame from the
 * `retail-stock-counts` source. "Start a count" opens the `count-new` sheet;
 * nothing on hand changes until a count's differences are approved.
 */
export default function RetailStockCountsPage() {
  return (
    <Suspense>
      <ListFrame source="retail-stock-counts" title="Counts" />
    </Suspense>
  );
}
