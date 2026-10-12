"use client";

import { Suspense } from "react";

import { ListFrame } from "@/components/list-frame/list-frame";

/**
 * Lay-bys (50-floor W-42, `LaybysList.png`, FLR-06): drawn by ListFrame from
 * the `retail-laybys` source. "+ New lay-by" opens `?sheet=layby-new`; a row
 * opens `?sheet=layby&id=` to take a payment, move the pay-by day, hand it
 * over or cancel it — the kinds in `lib/retail/sheet-kinds/laybys.ts`.
 */
export default function LaybysPage() {
  return (
    <Suspense>
      <ListFrame source="retail-laybys" title="Lay-bys" />
    </Suspense>
  );
}
