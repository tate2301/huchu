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
  summary: {
    ticketsProcessedPerHour: number;
    pendingSupplierPaymentsCount: number;
    averagePendingApprovalAgeDays: number;
    heldTicketsOldestAgeHours: number;
    marginPerKg: number;
    marginPercent: number;
    balanceIntegrityDifference: number;
  };
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
      createdAt?: string;
      batch: { batchNumber: string; category: string };
    }>;
    pendingSupplierPayments: Array<{
      id: string;
      purchaseNumber: string;
      purchaseDate: string;
      sellerName?: string | null;
      totalAmount: number;
      currency: string;
    }>;
  };
  weightedAverageCostByMaterial: Array<{
    label: string;
    weightedAverageCostPerKg: number;
    purchaseWeight: number;
    purchaseValue: number;
  }>;
  supplierPerformance: Array<{
    supplier: string;
    tickets: number;
    repeatMonths: number;
    weightKg: number;
    spend: number;
    avgBuyPricePerKg: number;
    estimatedMarginContribution: number;
    currency: string;
  }>;
  reconciliation: {
    varianceByWeek: Array<{
      weekLabel: string;
      varianceKg: number;
      saleCount: number;
    }>;
    balanceIntegrity: {
      currentBalanceTotal: number;
      balanceEntryNet: number;
      difference: number;
    };
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

  const supplierPaymentColumns = useMemo<
    ColumnDef<DashboardPayload["queues"]["pendingSupplierPayments"][number]>[]
  >(
    () => [
      { id: "ticket", header: "Ticket #", accessorKey: "purchaseNumber" },
      {
        id: "supplier",
        header: "Supplier",
        accessorFn: (row) => row.sellerName || "Unknown supplier",
      },
      {
        id: "date",
        header: "Date",
        cell: ({ row }) => new Date(row.original.purchaseDate).toLocaleDateString(),
      },
      {
        id: "amount",
        header: "Amount",
        cell: ({ row }) => (
          <NumericCell>
            {row.original.currency} {row.original.totalAmount.toFixed(2)}
          </NumericCell>
        ),
      },
    ],
    [],
  );

  const weightedAverageCostColumns = useMemo<
    ColumnDef<DashboardPayload["weightedAverageCostByMaterial"][number]>[]
  >(
    () => [
      { id: "material", header: "Material", accessorKey: "label" },
      {
        id: "avg",
        header: "WAC / kg",
        cell: ({ row }) => (
          <NumericCell>USD {row.original.weightedAverageCostPerKg.toFixed(2)}</NumericCell>
        ),
      },
      {
        id: "weight",
        header: "Weight (kg)",
        cell: ({ row }) => <NumericCell>{row.original.purchaseWeight.toFixed(2)}</NumericCell>,
      },
      {
        id: "value",
        header: "Cost",
        cell: ({ row }) => <NumericCell>USD {row.original.purchaseValue.toFixed(2)}</NumericCell>,
      },
    ],
    [],
  );

  const supplierPerformanceColumns = useMemo<
    ColumnDef<DashboardPayload["supplierPerformance"][number]>[]
  >(
    () => [
      { id: "supplier", header: "Supplier", accessorKey: "supplier" },
      { id: "tickets", header: "Tickets", cell: ({ row }) => <NumericCell>{row.original.tickets}</NumericCell> },
      { id: "repeat", header: "Repeat Months", cell: ({ row }) => <NumericCell>{row.original.repeatMonths}</NumericCell> },
      { id: "weight", header: "Weight (kg)", cell: ({ row }) => <NumericCell>{row.original.weightKg.toFixed(2)}</NumericCell> },
      {
        id: "margin",
        header: "Est. Margin Contribution",
        cell: ({ row }) => (
          <NumericCell>
            {row.original.currency} {row.original.estimatedMarginContribution.toFixed(2)}
          </NumericCell>
        ),
      },
    ],
    [],
  );

  const reconciliationColumns = useMemo<
    ColumnDef<DashboardPayload["reconciliation"]["varianceByWeek"][number]>[]
  >(
    () => [
      { id: "week", header: "Week", accessorKey: "weekLabel" },
      { id: "sales", header: "Sales", cell: ({ row }) => <NumericCell>{row.original.saleCount}</NumericCell> },
      { id: "variance", header: "Variance (kg)", cell: ({ row }) => <NumericCell>{row.original.varianceKg.toFixed(2)}</NumericCell> },
    ],
    [],
  );

  const views = [
    { id: "materials", label: "Material mix", count: data?.topMaterials.length ?? 0 },
    { id: "exposure", label: "Operator exposure", count: data?.queues.balances.length ?? 0 },
    { id: "pending-sales", label: "Pending sales", count: data?.queues.pendingSales.length ?? 0 },
    { id: "supplier-payments", label: "Supplier Payments", count: data?.queues.pendingSupplierPayments.length ?? 0 },
    { id: "wac", label: "Weighted Avg Cost", count: data?.weightedAverageCostByMaterial.length ?? 0 },
    { id: "supplier-margin", label: "Supplier Margin", count: data?.supplierPerformance.length ?? 0 },
    { id: "reconciliation", label: "Reconciliation", count: data?.reconciliation.varianceByWeek.length ?? 0 },
  ];

  return (
    <ScrapShell
      title="Reports"
      description="Review mix, trading throughput, operator exposure, and reconciliation health."
    >
      {data ? (
        <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border p-3">
            <div className="text-xs text-muted-foreground">Tickets / Hour</div>
            <div className="font-mono text-lg">{data.summary.ticketsProcessedPerHour.toFixed(2)}</div>
          </div>
          <div className="rounded-xl border p-3">
            <div className="text-xs text-muted-foreground">Pending Supplier Payments</div>
            <div className="font-mono text-lg">{data.summary.pendingSupplierPaymentsCount}</div>
          </div>
          <div className="rounded-xl border p-3">
            <div className="text-xs text-muted-foreground">Pending Approval Age (days)</div>
            <div className="font-mono text-lg">{data.summary.averagePendingApprovalAgeDays.toFixed(2)}</div>
          </div>
          <div className="rounded-xl border p-3">
            <div className="text-xs text-muted-foreground">Balance Integrity Delta</div>
            <div className="font-mono text-lg">USD {data.summary.balanceIntegrityDifference.toFixed(2)}</div>
          </div>
        </div>
      ) : null}
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
        {activeView === "supplier-payments" ? (
          <DataTable
            data={data?.queues.pendingSupplierPayments ?? []}
            columns={supplierPaymentColumns}
            features={{ sorting: true, globalFilter: true, pagination: true }}
            pagination={{ enabled: true, server: false }}
            searchPlaceholder="Search pending supplier payments"
            tableClassName="text-sm"
            emptyState={isLoading ? "Loading supplier payments..." : "No pending supplier payments"}
          />
        ) : null}
        {activeView === "wac" ? (
          <DataTable
            data={data?.weightedAverageCostByMaterial ?? []}
            columns={weightedAverageCostColumns}
            features={{ sorting: true, globalFilter: true, pagination: true }}
            pagination={{ enabled: true, server: false }}
            searchPlaceholder="Search weighted average cost"
            tableClassName="text-sm"
            emptyState={isLoading ? "Loading weighted average cost..." : "No weighted average cost data"}
          />
        ) : null}
        {activeView === "supplier-margin" ? (
          <DataTable
            data={data?.supplierPerformance ?? []}
            columns={supplierPerformanceColumns}
            features={{ sorting: true, globalFilter: true, pagination: true }}
            pagination={{ enabled: true, server: false }}
            searchPlaceholder="Search supplier margin"
            tableClassName="text-sm"
            emptyState={isLoading ? "Loading supplier margin..." : "No supplier margin data"}
          />
        ) : null}
        {activeView === "reconciliation" ? (
          <DataTable
            data={data?.reconciliation.varianceByWeek ?? []}
            columns={reconciliationColumns}
            features={{ sorting: true, globalFilter: true, pagination: true }}
            pagination={{ enabled: true, server: false }}
            searchPlaceholder="Search reconciliation variance"
            tableClassName="text-sm"
            emptyState={isLoading ? "Loading reconciliation..." : "No reconciliation data"}
          />
        ) : null}
      </VerticalDataViews>
    </ScrapShell>
  );
}
