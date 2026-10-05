"use client";

import * as React from "react";
import { Suspense } from "react";
import { useParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";

import { RecordFrame } from "@/components/record-frame/record-frame";
import { BreakCaseDialog } from "@/components/retail/break-case-dialog";
import { ProductDialog, type RetailProduct } from "@/components/retail/product-dialogs";
import type { ProductRecord } from "@/lib/retail/product-record";
import { productKind } from "@/lib/retail/record-kinds";

/**
 * A product (00-foundations 5.6.10, Product board): on RecordFrame, its
 * details edited in place in the rail and its way to the bin. The product
 * form and opening cases stay as they are until the products spec replaces
 * them with its sheets.
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
  const [editing, setEditing] = React.useState<ProductRecord | null>(null);
  const [opening, setOpening] = React.useState<ProductRecord | null>(null);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["record-activity"] });
  };

  return (
    <RecordFrame
      kind={productKind}
      id={id}
      onEvent={(event, product) => {
        if (event === "edit") setEditing(product);
        if (event === "break-case") setOpening(product);
      }}
    >
      <ProductDialog
        open={Boolean(editing)}
        onOpenChange={(open) => {
          if (!open) {
            setEditing(null);
            refresh();
          }
        }}
        product={editing ? ({ ...editing, inventoryItemId: editing.inventoryItemId } as RetailProduct) : null}
      />
      {opening?.packOf ? (
        <BreakCaseDialog
          open
          onOpenChange={(open) => {
            if (!open) {
              setOpening(null);
              refresh();
            }
          }}
          product={opening}
        />
      ) : null}
    </RecordFrame>
  );
}
