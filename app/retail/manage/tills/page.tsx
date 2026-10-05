"use client";

import { Suspense } from "react";

import { ListFrame } from "@/components/list-frame/list-frame";

/**
 * Setup › Tills and devices (10-setup 5.5; W-04, W-76): drawn by ListFrame
 * from the `retail-tills` source, refetched every 30 seconds. A row opens
 * `?sheet=till&id=`; "Pair a till" opens `?sheet=till-new` — the sheet kinds
 * in `lib/retail/sheet-kinds/tills.ts`.
 */
export default function TillsPage() {
  return (
    <Suspense>
      <ListFrame source="retail-tills" title="Tills and devices" />
    </Suspense>
  );
}
