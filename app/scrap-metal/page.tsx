"use client";

import Link from "next/link";
import { useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useQuery } from "@tanstack/react-query";

import { ScrapShell } from "@/components/scrap-metal/scrap-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { NumericCell } from "@/components/ui/numeric-cell";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { Coins, Package, Payments, Plus, ReceiptLong, Wallet } from "@/lib/icons";

type DashboardPayload = {
  summary: {
    purchasesThisMonthValue: number;
    purchasesThisMonthWeight: number;
    salesThisMonthValue: number;
    salesThisMonthWeight: number;
    estimatedMarginThisMonth: number;
    readyBatchCount: number;
    collectingBatchCount: number;
    pendingSalesCount: number;
    approvedSalesCount: number;
    activeMaterialsCount: number;
    materialsCount: number;
    operatorBalanceExposure: number;
    overdueSettlementAmount: number;
  };
  topMaterials: Array<{
    label: string;
    purchaseWeight: number;
    saleWeight: number;
    purchaseValue: number;
    saleValue: number;
  }>;
  queues: {
    readyBatches: Array<{ id: string; batchNumber: string; totalWeight: number; status: string; category: string }>;
    pendingSales: Array<{
      id: string;
      buyerName: string;
      totalAmount: number;
      soldWeight: number;
      status: string;
      batch: { batchNumber: string; category: string };
    }>;
    balances: Array<{
      id: string;
      balance: number;
      employee: { id: string; name: string; employeeId: string };
    }>;
  };
};

export default function ScrapMetalPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["scrap-metal-dashboard-v2"],
    queryFn: () => fetchJson<DashboardPayload>("/api/scrap-metal/dashboard"),
  });

  const queueColumns = useMemo<ColumnDef<DashboardPayload["queues"]["pendingSales"][number]>[]>(
    () => [
      {
        id: "buyer",
        header: "Buyer",
        accessorFn: (row) => `${row.buyerName} ${row.batch.batchNumber}`,
        cell: ({ row }) => (
          <div>
            <div className="font-semibold">{row.original.buyerName}</div>
            <div className="font-mono text-xs text-muted-foreground">
              {row.original.batch.batchNumber}
            </div>
          </div>
        ),
      },
      {
        id: "weight",
        header: "Sold kg",
        cell: ({ row }) => <NumericCell>{row.original.soldWeight.toFixed(2)}</NumericCell>,
      },
      {
        id: "value",
        header: "Value",
        cell: ({ row }) => <NumericCell>USD {row.original.totalAmount.toFixed(2)}</NumericCell>,
      },
    ],
    [],
  );

  return (
    <ScrapShell
      title="Scrap & Recycling"
      description="Run buying, yard stock, bulk trading, and operator settlements from one workspace."
      actions={
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm">
            <Link href="/scrap-metal/buying/purchases">
              <Plus className="h-4 w-4" />
              Record Purchase
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/scrap-metal/yard/batches">
              <Package className="h-4 w-4" />
              Open Batch
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/scrap-metal/trading/sales">
              <ReceiptLong className="h-4 w-4" />
              Record Sale
            </Link>
          </Button>
        </div>
      }
    >
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to load command center</AlertTitle>
          <AlertDescription>{getApiErrorMessage(error)}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl bg-[var(--surface-muted)] p-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Payments className="h-4 w-4" />
            Bought this month
          </div>
          <div className="mt-2 text-xl font-semibold">
            USD {data?.summary.purchasesThisMonthValue.toFixed(2) ?? "0.00"}
          </div>
          <div className="text-xs text-muted-foreground">
            {data?.summary.purchasesThisMonthWeight.toFixed(2) ?? "0.00"} kg
          </div>
        </div>
        <div className="rounded-xl bg-[var(--surface-muted)] p-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <ReceiptLong className="h-4 w-4" />
            Sold this month
          </div>
          <div className="mt-2 text-xl font-semibold">
            USD {data?.summary.salesThisMonthValue.toFixed(2) ?? "0.00"}
          </div>
          <div className="text-xs text-muted-foreground">
            {data?.summary.salesThisMonthWeight.toFixed(2) ?? "0.00"} kg
          </div>
        </div>
        <div className="rounded-xl bg-[var(--surface-muted)] p-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Coins className="h-4 w-4" />
            Est. margin
          </div>
          <div className="mt-2 text-xl font-semibold">
            USD {data?.summary.estimatedMarginThisMonth.toFixed(2) ?? "0.00"}
          </div>
          <div className="text-xs text-muted-foreground">
            {data?.summary.readyBatchCount ?? 0} ready batches
          </div>
        </div>
        <div className="rounded-xl bg-[var(--surface-muted)] p-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Wallet className="h-4 w-4" />
            Settlement exposure
          </div>
          <div className="mt-2 text-xl font-semibold">
            USD {data?.summary.overdueSettlementAmount.toFixed(2) ?? "0.00"}
          </div>
          <div className="text-xs text-muted-foreground">
            balance exposure USD {data?.summary.operatorBalanceExposure.toFixed(2) ?? "0.00"}
          </div>
        </div>
      </div>

      <section className="grid gap-3 lg:grid-cols-[minmax(0,1.3fr)_320px]">
        <div className="space-y-3">
          <DataTable
            data={data?.queues.pendingSales ?? []}
            columns={queueColumns}
            features={{ sorting: true, globalFilter: true, pagination: true }}
            pagination={{ enabled: true, server: false }}
            searchPlaceholder="Search pending sales"
            tableClassName="text-sm"
            emptyState={isLoading ? "Loading pending sales..." : "No pending sales"}
            toolbar={<span className="text-xs text-muted-foreground">Pending bulk sales</span>}
          />
        </div>

        <div className="space-y-3">
          <div className="rounded-xl bg-[var(--surface-muted)] p-3">
            <div className="text-xs text-muted-foreground">Yard position</div>
            <div className="mt-2 text-sm font-medium">
              {data?.summary.collectingBatchCount ?? 0} collecting
            </div>
            <div className="text-sm font-medium">{data?.summary.readyBatchCount ?? 0} ready</div>
          </div>
          <div className="rounded-xl bg-[var(--surface-muted)] p-3">
            <div className="text-xs text-muted-foreground">Material coverage</div>
            <div className="mt-2 text-sm font-medium">
              {data?.summary.activeMaterialsCount ?? 0} active of {data?.summary.materialsCount ?? 0}
            </div>
          </div>
          <div className="rounded-xl bg-[var(--surface-muted)] p-3">
            <div className="text-xs text-muted-foreground">Operator balances</div>
            <div className="mt-2 space-y-2">
              {(data?.queues.balances ?? []).slice(0, 5).map((balance) => (
                <div key={balance.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate">{balance.employee.name}</span>
                  <NumericCell>USD {balance.balance.toFixed(2)}</NumericCell>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </ScrapShell>
  );
}
