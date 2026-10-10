"use client";

import { Suspense } from "react";

import { ListFrame } from "@/components/list-frame/list-frame";

/**
 * Setup › Bin (80-admin 5.10, W-63): everything moved to the bin in the last
 * 30 days, of every kind, drawn by ListFrame from the `retail-bin` source.
 * Restore brings one back at once; the owner deletes for good.
 */
export default function RetailBinPage() {
  return (
    <Suspense>
      <ListFrame source="retail-bin" title="Bin" />
    </Suspense>
  );
}
