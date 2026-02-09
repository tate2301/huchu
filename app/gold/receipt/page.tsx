"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

import { GoldShell } from "@/components/gold/gold-shell";
import { fetchGoldDispatches, fetchGoldReceipts } from "@/lib/api";
import { ReceiptForm } from "@/app/gold/components/receipt-form";

const goldRoutes = {
  menu: "/gold",
  pour: "/gold/pour",
  dispatch: "/gold/dispatch",
  receipt: "/gold/receipt",
  reconciliation: "/gold/reconciliation",
  audit: "/gold/audit",
} as const;

type GoldView = keyof typeof goldRoutes;

export default function GoldReceiptPage() {
  const router = useRouter();

  const { data: dispatchesData } = useQuery({
    queryKey: ["gold-dispatches"],
    queryFn: () => fetchGoldDispatches({ limit: 200 }),
  });

  const { data: receiptsData } = useQuery({
    queryKey: ["gold-receipts"],
    queryFn: () => fetchGoldReceipts({ limit: 200 }),
  });

  const dispatches = useMemo(
    () => dispatchesData?.data ?? [],
    [dispatchesData],
  );
  const receipts = useMemo(() => receiptsData?.data ?? [], [receiptsData]);

  const receiptByDispatchId = useMemo(() => {
    const map = new Map<string, (typeof receipts)[number]>();
    receipts.forEach((receipt) => {
      map.set(receipt.goldDispatch.id, receipt);
    });
    return map;
  }, [receipts]);

  const availableDispatches = useMemo(
    () => dispatches.filter((dispatch) => !receiptByDispatchId.has(dispatch.id)),
    [dispatches, receiptByDispatchId],
  );

  const handleNavigate = (view: GoldView) => {
    router.push(goldRoutes[view]);
  };

  return (
    <GoldShell activeTab="receipt" description="Record buyer assay receipt">
      <ReceiptForm
        setViewMode={handleNavigate}
        availableDispatches={availableDispatches}
      />
    </GoldShell>
  );
}
