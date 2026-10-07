"use client";

import { Suspense } from "react";

import { ListFrame } from "@/components/list-frame/list-frame";

/**
 * Sales (50-floor, SalesList board): every sale and refund the tills rang,
 * drawn by ListFrame from the `retail-sales` source. No primary: sales are
 * rung at the till. A row opens the sale; its menu reprints or sends the
 * receipt (`?sheet=sale-send` when the sale has no customer number).
 */
export default function SalesPage() {
  return (
    <Suspense>
      <ListFrame source="retail-sales" title="Sales" />
    </Suspense>
  );
}
