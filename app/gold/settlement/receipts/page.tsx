"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";

import { GoldShell } from "@/components/gold/gold-shell";
import { DataListShell } from "@/components/shared/data-list-shell";
import { PageIntro } from "@/components/shared/page-intro";
import { RecordSavedBanner } from "@/components/shared/record-saved-banner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fetchGoldReceipts } from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api-client";
import { goldRoutes } from "@/app/gold/routes";

export default function GoldSettlementReceiptsPage() {
  const searchParams = useSearchParams();
  const createdId = searchParams.get("createdId");
  const [query, setQuery] = useState("");

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["gold-receipts", "settlement-lane"],
    queryFn: () => fetchGoldReceipts({ limit: 300 }),
  });

  const receipts = useMemo(() => data?.data ?? [], [data]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return receipts;
    return receipts.filter((receipt) => {
      return (
        receipt.receiptNumber.toLowerCase().includes(term) ||
        receipt.goldDispatch.goldPour.pourBarId.toLowerCase().includes(term) ||
        receipt.paymentMethod.toLowerCase().includes(term)
      );
    });
  }, [query, receipts]);

  return (
    <GoldShell
      activeTab="settlement"
      title="Sales"
      description="All buyer sale records"
      actions={
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm">
            <Link href={goldRoutes.settlement.newReceipt}>Record Sale</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href={goldRoutes.settlement.payouts}>View Payouts</Link>
          </Button>
        </div>
      }
    >
      <PageIntro
        title="Sales"
        purpose="Record buyer sale details for dispatched batches."
        nextStep="Add missing sale records for dispatches still waiting."
      />
      <RecordSavedBanner entityLabel="gold sale record" />

      <DataListShell
        title="Sales History"
        description="Recorded buyer sale entries"
        hasData={filtered.length > 0}
        isLoading={isLoading}
        isError={Boolean(error)}
        errorMessage={error ? getApiErrorMessage(error) : undefined}
        onRetry={() => void refetch()}
        emptyTitle="No sales recorded"
        emptyDescription="Record a sale to finish a dispatch."
        emptyAction={
          <Button asChild size="sm">
            <Link href={goldRoutes.settlement.newReceipt}>Record Sale</Link>
          </Button>
        }
        filters={
          <div className="max-w-sm">
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by sale number, batch, method"
              aria-label="Search sales"
            />
          </div>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted">
              <tr>
                <th className="p-3 text-left font-semibold">Date</th>
                <th className="p-3 text-left font-semibold">Sale No.</th>
                <th className="p-3 text-left font-semibold">Batch</th>
                <th className="p-3 text-left font-semibold">Method</th>
                <th className="p-3 text-right font-semibold">Paid Amount</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((receipt) => (
                <tr
                  key={receipt.id}
                  className={`border-b ${createdId === receipt.id ? "bg-[var(--status-success-bg)]" : ""}`}
                >
                  <td className="p-3">{new Date(receipt.receiptDate).toLocaleString()}</td>
                  <td className="p-3 font-medium">{receipt.receiptNumber}</td>
                  <td className="p-3">{receipt.goldDispatch.goldPour.pourBarId}</td>
                  <td className="p-3">{receipt.paymentMethod}</td>
                  <td className="p-3 text-right">{receipt.paidAmount.toFixed(3)} g</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DataListShell>
    </GoldShell>
  );
}
