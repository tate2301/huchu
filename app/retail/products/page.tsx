"use client";

import { Suspense } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";

import { ListFrame } from "@/components/list-frame/list-frame";
import { ProductDialog } from "@/components/retail/product-dialogs";

/**
 * Products (20-products 5.1): the shop's range, drawn by ListFrame from the
 * `retail-products` source — its tabs, filters, figures, totals and actions
 * are the source's.
 *
 * "+ New product" opens `?sheet=product-new` over the list. Until PRD-03's
 * sheet registers that kind, this page answers it with the product form that
 * exists today, and reads the list again when it closes.
 */
export default function ProductsPage() {
  return (
    <Suspense>
      <ListFrame source="retail-products" title="Products" />
      <NewProduct />
    </Suspense>
  );
}

function NewProduct() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const open = searchParams.get("sheet") === "product-new";

  const close = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("sheet");
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    void queryClient.invalidateQueries({ queryKey: ["list", "retail-products"] });
  };

  return <ProductDialog open={open} onOpenChange={(next) => (next ? undefined : close())} product={null} />;
}
