"use client";

import * as React from "react";
import { Suspense } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";

import { RecordFrame } from "@/components/record-frame/record-frame";
import { ConfirmDialog } from "@/components/workspace/confirm-dialog";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { orderBinnedWords, removeOrderAsk } from "@/lib/retail/asks/buying";
import type { OrderView } from "@/lib/retail/buying/order-view";
import { orderKind } from "@/lib/retail/record-kinds";

/**
 * An order (40-buying 5.4, W-30, W-70, W-71) on RecordFrame. The page owns
 * two of its ⋯ items: "Duplicate order" opens the new draft it makes, and a
 * draft's "Remove the order" asks (`removeorder`), moves it to the bin and
 * goes back to Orders.
 */
export default function OrderPage() {
  return (
    <Suspense>
      <Order />
    </Suspense>
  );
}

function Order() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [removing, setRemoving] = React.useState<OrderView | null>(null);

  const invalidate = () => Promise.all((orderKind.invalidates ?? []).map((queryKey) => queryClient.invalidateQueries({ queryKey })));

  const duplicate = async () => {
    try {
      const made = await fetchJson<{ data: { id: string }; message: string }>(`/api/v2/retail/buying/orders/${id}/duplicate`, { method: "POST" });
      toast({ title: made.message, variant: "success" });
      await invalidate();
      router.push(`/retail/buying/orders/${made.data.id}`);
    } catch (error) {
      toast({ title: getApiErrorMessage(error), variant: "destructive" });
    }
  };

  const remove = async () => {
    if (!removing) return;
    let keptUntil: string | undefined;
    try {
      keptUntil = (await fetchJson<{ keptUntil?: string }>("/api/v2/retail/bin", { method: "POST", body: JSON.stringify({ kind: "order", id }) })).keptUntil;
    } catch (error) {
      // Shown in the ask, which stays open ("PO-0003 has been sent. Cancel what is left instead.").
      throw new Error(getApiErrorMessage(error));
    }
    toast({ title: orderBinnedWords(removing.poNo, keptUntil), variant: "success" });
    await invalidate();
    router.push("/retail/buying/orders");
  };

  return (
    <RecordFrame
      kind={orderKind}
      id={id}
      onEvent={(event, order) => {
        if (event === "duplicate") void duplicate();
        if (event === "remove") setRemoving(order);
      }}
    >
      {removing ? (
        <ConfirmDialog
          ask={removeOrderAsk({ ref: removing.poNo, supplier: removing.supplier.name })}
          open
          onOpenChange={(open) => !open && setRemoving(null)}
          onConfirm={remove}
        />
      ) : null}
    </RecordFrame>
  );
}
