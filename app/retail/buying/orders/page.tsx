import "@/components/list-frame/list-frame.css";

import { Suspense } from "react";

import { ListFrame } from "@/components/list-frame/list-frame";

/**
 * Buying › Orders (40-buying 5.3, W-30): what the shop has ordered and what
 * is still to come, drawn by ListFrame from the `retail-orders` source;
 * "+ New order" opens the `order-new` sheet.
 */
export default function RetailOrdersPage() {
  return (
    <Suspense>
      <ListFrame source="retail-orders" title="Orders" />
    </Suspense>
  );
}
