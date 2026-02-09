"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

import { ContextHelp } from "@/components/shared/context-help";
import { Button } from "@/components/ui/button";
import { GoldShell } from "@/components/gold/gold-shell";
import { fetchGoldDispatches, fetchGoldReceipts } from "@/lib/api";
import { ReceiptForm } from "@/app/gold/components/receipt-form";

const formRoutes = {
  menu: "/gold",
  pour: "/gold/pour/new",
  dispatch: "/gold/dispatch/new",
  receipt: "/gold/receipt/new",
  reconciliation: "/gold/reconciliation",
  audit: "/gold/audit",
} as const;

type GoldView = keyof typeof formRoutes;

export default function GoldReceiptCreatePage() {
  const router = useRouter();

  const { data: dispatchesData } = useQuery({
    queryKey: ["gold-dispatches"],
    queryFn: () => fetchGoldDispatches({ limit: 200 }),
  });

  const { data: receiptsData } = useQuery({
    queryKey: ["gold-receipts"],
    queryFn: () => fetchGoldReceipts({ limit: 200 }),
  });

  const dispatches = useMemo(() => dispatchesData?.data ?? [], [dispatchesData]);
  const receipts = useMemo(() => receiptsData?.data ?? [], [receiptsData]);

  const receiptDispatchIds = useMemo(() => {
    const ids = new Set<string>();
    receipts.forEach((receipt) => {
      ids.add(receipt.goldDispatch.id);
    });
    return ids;
  }, [receipts]);

  const availableDispatches = useMemo(
    () => dispatches.filter((dispatch) => !receiptDispatchIds.has(dispatch.id)),
    [dispatches, receiptDispatchIds],
  );

  const handleNavigate = (view: GoldView) => {
    router.push(formRoutes[view]);
  };

  return (
    <GoldShell
      activeTab="receipt"
      description="Record final assay and sale confirmation"
      actions={
        <Button asChild variant="outline" size="sm">
          <Link href="/gold/receipt">View Receipt History</Link>
        </Button>
      }
    >
      <ContextHelp href="/help#gold" />
      <ReceiptForm
        setViewMode={handleNavigate}
        availableDispatches={availableDispatches}
      />
    </GoldShell>
  );
}

