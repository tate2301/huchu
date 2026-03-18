"use client";

import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useQuery } from "@tanstack/react-query";

import { ScrapShell } from "@/components/scrap-metal/scrap-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { DataTable } from "@/components/ui/data-table";
import { NumericCell } from "@/components/ui/numeric-cell";
import { VerticalDataViews } from "@/components/ui/vertical-data-views";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";

type DashboardPayload = {
  topMaterials: Array<{
    label: string;
    purchaseWeight: number;
    saleWeight: number;
    purchaseValue: number;
    saleValue: number;
  }>;
  queues: {
    balances: Array<{
      id: string;
      balance: number;
      employee: { id: string; name: string; employeeId: string };
    }>;
    pendingSales: Array<{
      id: string;
      buyerName: string;
      totalAmount: number;
      soldWeight: number;
      status: string;
      batch: { batchNumber: string; category: string };
    }>;
  };
};

export default function ScrapReportsPage() {
  const [activeView, setActiveView] = useState("materials");
  const { data, error, isLoading } = useQuery({
    queryKey: ["scrap-dashboard-reporting"],
    queryFn: () => fetchJson<DashboardPayload>("/api/scrap-metal/dashboard"),
  });

  const materialColumns = useMemo<ColumnDef<DashboardPayload["topMaterials"][number]>[]>(
    () => [
      { id: "label", header: "Material", accessorKey: "label" },
      {
        id: "purchaseWeight",
        header: "Bought kg",
        cell: ({ row }) => <NumericCell>{row.original.purchaseWeight.toFixed(2)}</NumericCell>,
      },
      {
        id: "saleWeight",
        header: "Sold kg",
        cell: ({ row }) => <NumericCell>{row.original.saleWeight.toFixed(2)}</NumericCell>,
      },
      {
        id: "purchaseValue",
        header: "Buy value",
        cell: ({ row }) => <NumericCell>USD {row.original.purchaseValue.toFixed(2)}</NumericCell>,
      },
      {
        id: "saleValue",
        header: "Sell value",
        cell: ({ row }) => <NumericCell>USD {row.original.saleValue.toFixed(2)}</NumericCell>,
      },
    ],
    [],
  );

  const exposureColumns = useMemo<ColumnDef<DashboardPayload["queues"]["balances"][number]>[]>(
    () => [
      {
        id: "employee",
        header: "Operator",
        accessorFn: (row) => `${row.employee.name} ${row.employee.employeeId}`,
        cell: ({ row }) => (
          <div>
            <div className="font-semibold">{row.original.employee.name}</div>
            <div className="font-mono text-xs text-muted-foreground">
              {row.original.employee.employeeId}
            </div>
          </div>
        ),
      },
      {
        id: "balance",
        header: "Exposure",
        cell: ({ row }) => <NumericCell>USD {row.original.balance.toFixed(2)}</NumericCell>,
      },
    ],
    [],
  );

  const pendingSalesColumns = useMemo<
    ColumnDef<DashboardPayload["queues"]["pendingSales"][number]>[]
  >(
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

  const views = [
    { id: "materials", label: "Material mix", count: data?.topMaterials.length ?? 0 },
    { id: "exposure", label: "Operator exposure", count: data?.queues.balances.length ?? 0 },
    { id: "pending-sales", label: "Pending sales", count: data?.queues.pendingSales.length ?? 0 },
  ];

  return (
    <ScrapShell
      title="Reports"
      description="Review mix, trading throughput, and current operator exposure."
    >
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to load reports</AlertTitle>
          <AlertDescription>{getApiErrorMessage(error)}</AlertDescription>
        </Alert>
      ) : null}

      <VerticalDataViews
        items={views}
        value={activeView}
        onValueChange={setActiveView}
        railLabel="Views"
      >
        {activeView === "materials" ? (
          <DataTable
            data={data?.topMaterials ?? []}
            columns={materialColumns}
            features={{ sorting: true, globalFilter: true, pagination: true }}
            pagination={{ enabled: true, server: false }}
            searchPlaceholder="Search material mix"
            tableClassName="text-sm"
            emptyState={isLoading ? "Loading report..." : "No material activity yet"}
          />
        ) : null}
        {activeView === "exposure" ? (
          <DataTable
            data={data?.queues.balances ?? []}
            columns={exposureColumns}
            features={{ sorting: true, globalFilter: true, pagination: true }}
            pagination={{ enabled: true, server: false }}
            searchPlaceholder="Search operator exposure"
            tableClassName="text-sm"
            emptyState={isLoading ? "Loading report..." : "No operator exposure yet"}
          />
        ) : null}
        {activeView === "pending-sales" ? (
          <DataTable
            data={data?.queues.pendingSales ?? []}
            columns={pendingSalesColumns}
            features={{ sorting: true, globalFilter: true, pagination: true }}
            pagination={{ enabled: true, server: false }}
            searchPlaceholder="Search pending sales"
            tableClassName="text-sm"
            emptyState={isLoading ? "Loading report..." : "No pending sales"}
          />
        ) : null}
      </VerticalDataViews>
    </ScrapShell>
  );
}
