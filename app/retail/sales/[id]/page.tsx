"use client";

import { Suspense } from "react";
import { useParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";

import { RecordFrame } from "@/components/record-frame/record-frame";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { sentWords } from "@/lib/retail/asks";
import type { SaleView } from "@/lib/retail/floor/sale-view";
import { saleKind } from "@/lib/retail/record-kinds";

/** A sale or a refund (50-floor, SaleRecord board), on RecordFrame. */
export default function SalePage() {
  return (
    <Suspense>
      <Sale />
    </Suspense>
  );
}

function Sale() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // "Send on WhatsApp" with a customer number: straight to it, and say where it went.
  const onEvent = async (event: string, sale: SaleView) => {
    if (event !== "send") return;
    try {
      const answer = await fetchJson<{ to: string; waiting: boolean }>(`/api/v2/retail/sales/${sale.id}/send`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      toast({ title: sentWords(answer), variant: "success" });
      await queryClient.invalidateQueries({ queryKey: ["record-activity"] });
    } catch (error) {
      toast({ title: getApiErrorMessage(error, "That did not work. Try again."), variant: "destructive" });
    }
  };

  return <RecordFrame kind={saleKind} id={id} onEvent={(event, sale) => void onEvent(event, sale)} />;
}
