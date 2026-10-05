"use client";

import { Suspense } from "react";

import { ListFrame } from "@/components/list-frame/list-frame";

/**
 * Setup › Sites (10-setup 5.4, W-03, W-66): drawn by ListFrame from the
 * `retail-sites` source. A row opens `?sheet=site&id=`; "Add a site" opens
 * `?sheet=site-new` — the sheet kinds in `lib/retail/sheet-kinds/setup.ts`.
 */
export default function SitesPage() {
  return (
    <Suspense>
      <ListFrame source="retail-sites" title="Sites" />
    </Suspense>
  );
}
