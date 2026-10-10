"use client";

import { Suspense } from "react";

import { ListFrame } from "@/components/list-frame/list-frame";

/**
 * Price lists (PRD-05, `PriceLists.png`): drawn by ListFrame from the
 * `retail-price-lists` source. A row opens the list's worksheet; "+ New price
 * list" opens `?sheet=price-list-new`, and a row's "Edit the rules"
 * `?sheet=price-list-rules&id=` — both kinds in `lib/retail/sheet-kinds/products.ts`.
 */
export default function PriceListsPage() {
  return (
    <Suspense>
      <ListFrame source="retail-price-lists" title="Price lists" />
    </Suspense>
  );
}
