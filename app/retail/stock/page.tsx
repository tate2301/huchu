"use client";

import { Suspense } from "react";

import { ListFrame } from "@/components/list-frame/list-frame";

/**
 * Stock › On hand (30-stock 5.1, W-21): every stock line, drawn by ListFrame
 * from the `retail-stock-on-hand` source — its Low, Out and Too much tabs,
 * cover and value at cost are the source's. "+ Add a product" opens
 * `?sheet=product-new` over it; Change reorder level opens
 * `?sheet=reorder-levels` with the ticked lines.
 */
export default function OnHandPage() {
  return (
    <Suspense>
      <ListFrame source="retail-stock-on-hand" title="On hand" />
    </Suspense>
  );
}
