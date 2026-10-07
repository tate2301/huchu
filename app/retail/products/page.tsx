"use client";

import { Suspense } from "react";

import { ListFrame } from "@/components/list-frame/list-frame";

/**
 * Products (20-products 5.1): the shop's range, drawn by ListFrame from the
 * `retail-products` source — its tabs, filters, figures, totals and actions
 * are the source's. "+ New product" opens `?sheet=product-new` over it, and a
 * row's Edit `?sheet=product-edit`; the shell's sheet host draws both.
 */
export default function ProductsPage() {
  return (
    <Suspense>
      <ListFrame source="retail-products" title="Products" />
    </Suspense>
  );
}
