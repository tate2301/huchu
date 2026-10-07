"use client";

import { Suspense } from "react";

import { ListFrame } from "@/components/list-frame/list-frame";

/**
 * Bundles and packs (PRD-08, `BundlesList.png`): drawn by ListFrame from the
 * `retail-bundles` source. A pack opens its product record, a bundle its own;
 * "+ New bundle or pack" is a menu of `?sheet=pack-new` and
 * `?sheet=bundle-new&kind=…`, and a row's "Change it" `?sheet=bundle-edit&id=`
 * (or `product-edit` for a pack) — kinds in `lib/retail/sheet-kinds/bundles.ts`.
 */
export default function BundlesPage() {
  return (
    <Suspense>
      <ListFrame source="retail-bundles" title="Bundles and packs" />
    </Suspense>
  );
}
