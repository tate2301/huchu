"use client";

import { Suspense } from "react";

import { ListFrame } from "@/components/list-frame/list-frame";

/**
 * Promotions (PRD-09, `PromotionsList.png`): drawn by ListFrame from the
 * `retail-promotions` source. "+ New promotion" opens `?sheet=promotion-new`,
 * a row's "Edit rules" `?sheet=promotion-edit&id=` — kinds in
 * `lib/retail/sheet-kinds/promotions.ts`; a code opens its record.
 */
export default function PromotionsPage() {
  return (
    <Suspense>
      <ListFrame source="retail-promotions" title="Promotions" />
    </Suspense>
  );
}
