"use client";

import { Suspense } from "react";

import { ListFrame } from "@/components/list-frame/list-frame";

/**
 * Stock › Movements (30-stock 5.4, W-28): every in and out with its reason,
 * its document and what it left on the shelf, drawn by ListFrame from the
 * `retail-stock-movements` source. `?product=<id>` scopes it to one product,
 * named in the header with "All products" to clear it.
 */
export default function RetailStockMovementsPage() {
  return (
    <Suspense>
      <ListFrame source="retail-stock-movements" title="Movements" />
    </Suspense>
  );
}
