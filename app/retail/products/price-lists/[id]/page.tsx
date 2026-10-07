"use client";

import { Suspense, use } from "react";

import { ListFrame } from "@/components/list-frame/list-frame";

/**
 * One price list's worksheet (PRD-05; PRD-07 makes its prices editable):
 * ListFrame over `retail-prices` scoped to the list. The header reads the
 * list's name and "Default price list · all tills · all sites", with "Edit the
 * rules" opening `?sheet=price-list-rules&id=` for those who may.
 */
export default function PriceListPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <Suspense>
      <ListFrame
        source="retail-prices"
        title="Price list"
        back={{ label: "Price lists", href: "/retail/products/price-lists" }}
        parent={{ key: "list", value: id }}
      />
    </Suspense>
  );
}
