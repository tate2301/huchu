"use client";

import * as React from "react";
import { Suspense } from "react";
import { useParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";

import { RecordFrame } from "@/components/record-frame/record-frame";
import { ConfirmDialog } from "@/components/workspace/confirm-dialog";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { cancelTransferAsk } from "@/lib/retail/asks/stock";
import { transferKind } from "@/lib/retail/record-kinds";
import type { TransferView } from "@/lib/retail/stock/transfer-record";

/**
 * A transfer (30-stock 5.14, W-24): stock on its way between two sites, on
 * RecordFrame. "Receive it" and "Change the lines" open their sheets over it;
 * "Cancel the transfer" asks (`canceltransfer`) here and puts what is still
 * on the way back on the site it left.
 */
export default function TransferPage() {
  return (
    <Suspense>
      <Transfer />
    </Suspense>
  );
}

function Transfer() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [cancelling, setCancelling] = React.useState<TransferView | null>(null);

  const cancel = async () => {
    let message: string;
    try {
      message = (await fetchJson<{ message: string }>(`/api/v2/retail/stock/transfers/${id}/cancel`, { method: "POST" })).message;
    } catch (error) {
      // Shown in the ask, which stays open ("TRF-0007 has been received.").
      throw new Error(getApiErrorMessage(error));
    }
    toast({ title: message, variant: "success" });
    await Promise.all(
      [
        transferKind.queryKey(id),
        ["record-activity"],
        ["reports"],
        ...(transferKind.invalidates ?? []),
      ].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
    );
  };

  return (
    <RecordFrame kind={transferKind} id={id} onEvent={(event, transfer) => event === "cancel" && setCancelling(transfer)}>
      {cancelling ? (
        <ConfirmDialog
          ask={cancelTransferAsk({
            transferNo: cancelling.transferNo,
            units: cancelling.toCome,
            from: cancelling.from.name,
            to: cancelling.to.name,
          })}
          open
          onOpenChange={(open) => !open && setCancelling(null)}
          onConfirm={cancel}
        />
      ) : null}
    </RecordFrame>
  );
}
