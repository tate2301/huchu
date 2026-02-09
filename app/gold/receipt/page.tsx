"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";

import { ContextHelp } from "@/components/shared/context-help";
import { RecordSavedBanner } from "@/components/shared/record-saved-banner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { GoldShell } from "@/components/gold/gold-shell";
import { fetchGoldDispatches, fetchGoldReceipts } from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api-client";
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
  const searchParams = useSearchParams();
  const createdId = searchParams.get("createdId");

  const { data: dispatchesData } = useQuery({
    queryKey: ["gold-dispatches"],
    queryFn: () => fetchGoldDispatches({ limit: 200 }),
  });

  const {
    data: receiptsData,
    isLoading: receiptsLoading,
    error: receiptsError,
  } = useQuery({
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
      <RecordSavedBanner entityLabel="gold receipt" />
      <ContextHelp href="/help#gold" />
      <ReceiptForm
        setViewMode={handleNavigate}
        availableDispatches={availableDispatches}
      />
      <Card>
        <CardHeader>
          <CardTitle>Receipt History</CardTitle>
          <CardDescription>Recent buyer receipts</CardDescription>
        </CardHeader>
        <CardContent>
          {receiptsLoading ? (
            <p className="text-sm text-muted-foreground">Loading receipts...</p>
          ) : receiptsError ? (
            <Alert variant="destructive">
              <AlertTitle>Unable to load receipts</AlertTitle>
              <AlertDescription>{getApiErrorMessage(receiptsError)}</AlertDescription>
            </Alert>
          ) : receipts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No receipts recorded yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="p-3 text-left font-semibold">Date</th>
                    <th className="p-3 text-left font-semibold">Receipt No.</th>
                    <th className="p-3 text-left font-semibold">Pour</th>
                    <th className="p-3 text-right font-semibold">Paid Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {receipts.map((receipt) => (
                    <tr
                      key={receipt.id}
                      className={`border-b ${createdId === receipt.id ? "bg-[var(--status-success-bg)]" : ""}`}
                    >
                      <td className="p-3">{new Date(receipt.receiptDate).toLocaleString()}</td>
                      <td className="p-3">{receipt.receiptNumber}</td>
                      <td className="p-3">{receipt.goldDispatch.goldPour.pourBarId}</td>
                      <td className="p-3 text-right">{receipt.paidAmount.toFixed(3)} g</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </GoldShell>
  );
}
