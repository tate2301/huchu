"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

import { GoldShell } from "@/components/gold/gold-shell";
import { PageIntro } from "@/components/shared/page-intro";
import { Button } from "@/components/ui/button";
import { fetchGoldDispatches, fetchGoldReceipts } from "@/lib/api";
import { ReceiptForm } from "@/app/gold/components/receipt-form";
import { goldRoutes, mapLegacyGoldViewToRoute } from "@/app/gold/routes";

export default function GoldSettlementReceiptCreatePage() {
  const router = useRouter();

  const { data: dispatchesData } = useQuery({
    queryKey: ["gold-dispatches", "receipt-form"],
    queryFn: () => fetchGoldDispatches({ limit: 300 }),
  });

  const { data: receiptsData } = useQuery({
    queryKey: ["gold-receipts", "receipt-form"],
    queryFn: () => fetchGoldReceipts({ limit: 300 }),
  });

  const dispatches = useMemo(() => dispatchesData?.data ?? [], [dispatchesData]);
  const receipts = useMemo(() => receiptsData?.data ?? [], [receiptsData]);

  const receiptDispatchIds = useMemo(() => {
    const ids = new Set<string>();
    receipts.forEach((receipt) => ids.add(receipt.goldDispatch.id));
    return ids;
  }, [receipts]);

  const availableDispatches = useMemo(
    () => dispatches.filter((dispatch) => !receiptDispatchIds.has(dispatch.id)),
    [dispatches, receiptDispatchIds],
  );

  return (
    <GoldShell
      activeTab="settlement"
      title="Sales"
      description="Record a new sale"
      actions={
        <Button asChild size="sm" variant="outline">
          <Link href={goldRoutes.settlement.receipts}>View Sales</Link>
        </Button>
      }
    >
      <PageIntro
        title="Record Sale"
        purpose="Save buyer test and payment details."
        nextStep="Select a dispatch waiting for sale, fill details, and submit."
      />
      <ReceiptForm
        setViewMode={(view) => router.push(mapLegacyGoldViewToRoute(view))}
        availableDispatches={availableDispatches}
      />
    </GoldShell>
  );
}
