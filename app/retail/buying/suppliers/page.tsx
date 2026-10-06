import "@/components/list-frame/list-frame.css";

import { Suspense } from "react";

import { ListFrame } from "@/components/list-frame/list-frame";

/**
 * Buying › Suppliers (40-buying 5.1, W-29): who the shop buys from, drawn by
 * ListFrame from the `retail-suppliers` source; "+ New supplier" opens the
 * `supplier-new` sheet, and an empty shop sees the guide.
 */
export default function RetailSuppliersPage() {
  return (
    <Suspense>
      <ListFrame source="retail-suppliers" title="Suppliers" />
    </Suspense>
  );
}
