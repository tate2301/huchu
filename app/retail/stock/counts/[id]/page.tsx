"use client";

import * as React from "react";
import { Suspense } from "react";
import { useParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";

import { RecordFrame } from "@/components/record-frame/record-frame";
import { ConfirmDialog } from "@/components/workspace/confirm-dialog";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { cancelCountAsk } from "@/lib/retail/asks/stock";
import { countKind } from "@/lib/retail/record-kinds";
import type { CountView } from "@/lib/retail/stock/counts";

/**
 * A count (30-stock W-22, STK-06; board CountRecord), on RecordFrame: what it
 * found, the chart of every count of this shelf, its lines and Activity.
 * "Approve the differences" opens the review page; "Cancel the count" asks
 * (`cancelcount`) here and nothing on hand changes.
 */
export default function CountPage() {
  return (
    <Suspense>
      <Count />
    </Suspense>
  );
}

function Count() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [cancelling, setCancelling] = React.useState<CountView | null>(null);

  const cancel = async () => {
    try {
      await fetchJson(`/api/v2/retail/stock/counts/${id}/cancel`, { method: "POST" });
    } catch (error) {
      // Shown in the ask, which stays open ("Approved counts cannot be cancelled.").
      throw new Error(getApiErrorMessage(error));
    }
    toast({ title: `${cancelling?.countNo ?? "The count"} cancelled. Nothing on hand changed.`, variant: "success" });
    await Promise.all(
      [countKind.queryKey(id), ["record-activity"], ["reports"], ...(countKind.invalidates ?? [])].map((queryKey) =>
        queryClient.invalidateQueries({ queryKey }),
      ),
    );
  };

  return (
    <RecordFrame kind={countKind} id={id} onEvent={(event, count) => event === "cancel" && setCancelling(count)}>
      {cancelling ? (
        <ConfirmDialog
          ask={cancelCountAsk({ countNo: cancelling.countNo, counter: cancelling.counter.name })}
          open
          onOpenChange={(open) => !open && setCancelling(null)}
          onConfirm={cancel}
        />
      ) : null}
    </RecordFrame>
  );
}
