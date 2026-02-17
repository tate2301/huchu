"use client";

import Link from "next/link";
import { useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useQuery } from "@tanstack/react-query";

import { GoldShell } from "@/components/gold/gold-shell";
import { PageIntro } from "@/components/shared/page-intro";
import { RecordSavedBanner } from "@/components/shared/record-saved-banner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { NumericCell } from "@/components/ui/numeric-cell";
import { fetchGoldReceipts } from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api-client";
import { goldRoutes } from "@/app/gold/routes";

type GoldReceiptRow = Awaited<ReturnType<typeof fetchGoldReceipts>>["data"][number];

export default function GoldSettlementReceiptsPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["gold-receipts", "settlement-lane"],
    queryFn: () => fetchGoldReceipts({ limit: 300 }),
  });

  const rows = useMemo(
    () =>
      (data?.data ?? [])
        .slice()
        .sort((a, b) => b.receiptDate.localeCompare(a.receiptDate)),
    [data],
  );

  const columns = useMemo<ColumnDef<GoldReceiptRow>[]>(
    () => [
      {
        id: "receiptDate",
        header: "Date",
        cell: ({ row }) => (
          <NumericCell align="left">
            {new Date(row.original.receiptDate).toLocaleString()}
          </NumericCell>
        ),
      },
      {
        id: "receiptNumber",
        header: "Sale No.",
        cell: ({ row }) => (
          <span className="font-mono font-semibold">{row.original.receiptNumber}</span>
        ),
      },
      {
        id: "batch",
        header: "Batch",
        cell: ({ row }) => row.original.goldDispatch.goldPour.pourBarId,
      },
      {
        id: "paymentMethod",
        header: "Method",
        accessorKey: "paymentMethod",
      },
      {
        id: "paidAmount",
        header: "Paid Amount",
        cell: ({ row }) => (
          <NumericCell>{row.original.paidAmount.toFixed(3)} g</NumericCell>
        ),
      },
    ],
    [],
  );

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

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to load sales</AlertTitle>
          <AlertDescription>{getApiErrorMessage(error)}</AlertDescription>
        </Alert>
      ) : null}

      <section className="space-y-3">
        <header className="section-shell space-y-1">
          <h2 className="text-section-title text-foreground font-bold tracking-tight">
            Sales History
          </h2>
          <p className="text-sm text-muted-foreground">Recorded buyer sale entries</p>
        </header>
        <DataTable
          data={rows}
          columns={columns}
          searchPlaceholder="Search by sale number, batch, or method"
          searchSubmitLabel="Search"
          tableClassName="text-sm"
          pagination={{ enabled: true }}
          emptyState={isLoading ? "Loading sales..." : "No sales recorded."}
        />
      </section>
    </GoldShell>
  );
}
