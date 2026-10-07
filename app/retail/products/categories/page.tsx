"use client";

import { Suspense } from "react";

import { ListFrame } from "@/components/list-frame/list-frame";

/**
 * Categories (20-products 5.25, W-19): drawn by ListFrame from the
 * `retail-categories` source. A row opens `?sheet=category-edit&id=`; "+ New
 * category" opens `?sheet=category-new` — both sheet kinds in
 * `lib/retail/sheet-kinds/products.ts`.
 */
export default function CategoriesPage() {
  return (
    <Suspense>
      <ListFrame source="retail-categories" title="Categories" />
    </Suspense>
  );
}
