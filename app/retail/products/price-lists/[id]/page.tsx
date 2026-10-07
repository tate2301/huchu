"use client";

import { Suspense, use } from "react";

import { ListFrame } from "@/components/list-frame/list-frame";

/**
 * One price list's worksheet (PRD-05, PRD-07): ListFrame over `retail-prices`
 * scoped to the list. The header reads the list's name and "Default price
 * list · all tills · all sites", with "Edit the rules" and "Add products to
 * this list" for those who may change prices; for them the prices are inputs
 * with the save bar, and the ticked rows go to Change many prices.
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
