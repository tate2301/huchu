"use client";

import * as React from "react";
import { Suspense } from "react";
import { useParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";

import { RecordFrame } from "@/components/record-frame/record-frame";
import { BreakCaseDialog } from "@/components/retail/break-case-dialog";
import type { ProductView } from "@/lib/retail/products/view";
import { productKind } from "@/lib/retail/record-kinds";

/**
 * A product (00-foundations 5.6.10, Product board): on RecordFrame, its
 * details edited in place in the rail, Edit a product as a sheet over it, its
 * archive banner and its way to the bin. Opening cases stays a dialog until
 * STK-04 replaces it with its sheet.
 */
export default function ProductPage() {
  return (
    <Suspense>
      <Product />
    </Suspense>
  );
}

function Product() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const queryClient = useQueryClient();
  const [opening, setOpening] = React.useState<ProductView | null>(null);

  return (
    <RecordFrame
      kind={productKind}
      id={id}
      onEvent={(event, product) => {
        if (event === "break-case") setOpening(product);
      }}
    >
      {opening?.packOf ? (
        <BreakCaseDialog
          open
          onOpenChange={(open) => {
            if (!open) {
              setOpening(null);
              void queryClient.invalidateQueries({ queryKey: ["record-activity"] });
            }
          }}
          product={{
            id: opening.id,
            name: opening.name,
            packSize: opening.packSize,
            packOf: opening.packOf,
            siteId: opening.stock.siteId,
            onHand: opening.stock.onHand,
          }}
        />
      ) : null}
    </RecordFrame>
  );
}
