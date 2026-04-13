"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useQuery } from "@tanstack/react-query";

import { ScrapMobileCard, ScrapMobileCardHeader, ScrapMobileMetricStrip } from "@/components/scrap-metal/mobile-list-card";
import { ScrapShell } from "@/components/scrap-metal/scrap-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import { NumericCell } from "@/components/ui/numeric-cell";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { VerticalDataViews } from "@/components/ui/vertical-data-views";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { Calendar, Coins, Package, ReceiptLong, Scale, Wallet } from "@/lib/icons";

type SnapshotWindowMode = "day" | "week" | "month" | "all";

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
  };
};

function getUniqueOptions(values: string[]) {
  return Array.from(new Set(values.filter(Boolean))).sort((left, right) => left.localeCompare(right));
}

export default function ScrapReportsPage() {
  const [activeView, setActiveView] = useState("materials");
  const [windowMode, setWindowMode] = useState<SnapshotWindowMode>("month");
  const [anchorDate, setAnchorDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [fieldFilters, setFieldFilters] = useState<Record<string, string>>({});
  const activeFieldFilter = fieldFilters[activeView] ?? "all";
  const { data, error, isLoading } = useQuery({
    queryKey: ["scrap-dashboard-reporting", windowMode, anchorDate],
    queryFn: () =>
      fetchJson<DashboardPayload>(
        `/api/scrap-metal/dashboard?window=${encodeURIComponent(windowMode)}&anchorDate=${encodeURIComponent(anchorDate)}`,
      ),
  });

  const materialColumns = useMemo<ColumnDef<DashboardPayload["topMaterials"][number]>[]>(
    () => [
      { id: "label", header: "Material", accessorKey: "label" },
      { id: "purchaseWeight", header: "Bought kg", cell: ({ row }) => <NumericCell>{row.original.purchaseWeight.toFixed(2)}</NumericCell> },
      { id: "saleWeight", header: "Sold kg", cell: ({ row }) => <NumericCell>{row.original.saleWeight.toFixed(2)}</NumericCell> },
      { id: "purchaseValue", header: "Buy value", cell: ({ row }) => <NumericCell>USD {row.original.purchaseValue.toFixed(2)}</NumericCell> },
      { id: "saleValue", header: "Sell value", cell: ({ row }) => <NumericCell>USD {row.original.saleValue.toFixed(2)}</NumericCell> },
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
            <div className="font-mono text-xs text-muted-foreground">{row.original.employee.employeeId}</div>
          </div>
        ),
      },
      { id: "balance", header: "Exposure", cell: ({ row }) => <NumericCell>USD {row.original.balance.toFixed(2)}</NumericCell> },
    ],
    [],
  );

  const pendingSalesColumns = useMemo<ColumnDef<DashboardPayload["queues"]["pendingSales"][number]>[]>(
    () => [
      {
        id: "buyer",
        header: "Buyer",
        accessorFn: (row) => `${row.buyerName} ${row.batch.batchNumber}`,
        cell: ({ row }) => (
          <div>
            <div className="font-semibold">{row.original.buyerName}</div>
            <div className="font-mono text-xs text-muted-foreground">{row.original.batch.batchNumber}</div>
          </div>
        ),
      },
      { id: "weight", header: "Sold kg", cell: ({ row }) => <NumericCell>{row.original.soldWeight.toFixed(2)}</NumericCell> },
      { id: "value", header: "Value", cell: ({ row }) => <NumericCell>USD {row.original.totalAmount.toFixed(2)}</NumericCell> },
      { id: "status", header: "Status", accessorKey: "status" },
    ],
    [],
  );

  const supplierPaymentColumns = useMemo<ColumnDef<DashboardPayload["queues"]["pendingSupplierPayments"][number]>[]>(
    () => [
      { id: "ticket", header: "Ticket #", accessorKey: "purchaseNumber" },
      { id: "supplier", header: "Supplier", accessorFn: (row) => row.sellerName || "Unknown supplier" },
      { id: "date", header: "Date", cell: ({ row }) => new Date(row.original.purchaseDate).toLocaleDateString() },
      { id: "amount", header: "Amount", cell: ({ row }) => <NumericCell>{row.original.currency} {row.original.totalAmount.toFixed(2)}</NumericCell> },
    ],
    [],
  );

  const weightedAverageCostColumns = useMemo<ColumnDef<DashboardPayload["weightedAverageCostByMaterial"][number]>[]>(
    () => [
      { id: "material", header: "Material", accessorKey: "label" },
      { id: "avg", header: "WAC / kg", cell: ({ row }) => <NumericCell>USD {row.original.weightedAverageCostPerKg.toFixed(2)}</NumericCell> },
      { id: "weight", header: "Weight (kg)", cell: ({ row }) => <NumericCell>{row.original.purchaseWeight.toFixed(2)}</NumericCell> },
      { id: "value", header: "Cost", cell: ({ row }) => <NumericCell>USD {row.original.purchaseValue.toFixed(2)}</NumericCell> },
    ],
    [],
  );

  const supplierPerformanceColumns = useMemo<ColumnDef<DashboardPayload["supplierPerformance"][number]>[]>(
    () => [
      { id: "supplier", header: "Supplier", accessorKey: "supplier" },
      { id: "tickets", header: "Tickets", cell: ({ row }) => <NumericCell>{row.original.tickets}</NumericCell> },
      { id: "repeat", header: "Repeat Months", cell: ({ row }) => <NumericCell>{row.original.repeatMonths}</NumericCell> },
      { id: "weight", header: "Weight (kg)", cell: ({ row }) => <NumericCell>{row.original.weightKg.toFixed(2)}</NumericCell> },
      { id: "margin", header: "Est. Margin Contribution", cell: ({ row }) => <NumericCell>{row.original.currency} {row.original.estimatedMarginContribution.toFixed(2)}</NumericCell> },
    ],
    [],
  );

  const reconciliationColumns = useMemo<ColumnDef<DashboardPayload["reconciliation"]["varianceByWeek"][number]>[]>(
    () => [
      { id: "week", header: "Week", accessorKey: "weekLabel" },
      { id: "sales", header: "Sales", cell: ({ row }) => <NumericCell>{row.original.saleCount}</NumericCell> },
      { id: "variance", header: "Variance (kg)", cell: ({ row }) => <NumericCell>{row.original.varianceKg.toFixed(2)}</NumericCell> },
    ],
    [],
  );

  const materialRows = useMemo(() => {
    const rows = data?.topMaterials ?? [];
    if (activeView !== "materials" || activeFieldFilter === "all") return rows;
    return rows.filter((row) => row.label === activeFieldFilter);
  }, [activeFieldFilter, activeView, data?.topMaterials]);

  const exposureRows = useMemo(() => {
    const rows = data?.queues.balances ?? [];
    if (activeView !== "exposure" || activeFieldFilter === "all") return rows;
    return rows.filter((row) => row.employee.name === activeFieldFilter);
  }, [activeFieldFilter, activeView, data?.queues.balances]);

  const pendingSalesRows = useMemo(() => {
    const rows = data?.queues.pendingSales ?? [];
    if (activeView !== "pending-sales" || activeFieldFilter === "all") return rows;
    return rows.filter((row) => row.batch.batchNumber === activeFieldFilter);
  }, [activeFieldFilter, activeView, data?.queues.pendingSales]);

  const supplierPaymentRows = useMemo(() => {
    const rows = data?.queues.pendingSupplierPayments ?? [];
    if (activeView !== "supplier-payments" || activeFieldFilter === "all") return rows;
    return rows.filter((row) => (row.sellerName || "Unknown supplier") === activeFieldFilter);
  }, [activeFieldFilter, activeView, data?.queues.pendingSupplierPayments]);

  const wacRows = useMemo(() => {
    const rows = data?.weightedAverageCostByMaterial ?? [];
    if (activeView !== "wac" || activeFieldFilter === "all") return rows;
    return rows.filter((row) => row.label === activeFieldFilter);
  }, [activeFieldFilter, activeView, data?.weightedAverageCostByMaterial]);

  const supplierMarginRows = useMemo(() => {
    const rows = data?.supplierPerformance ?? [];
    if (activeView !== "supplier-margin" || activeFieldFilter === "all") return rows;
    return rows.filter((row) => row.supplier === activeFieldFilter);
  }, [activeFieldFilter, activeView, data?.supplierPerformance]);

  const reconciliationRows = useMemo(() => {
    const rows = data?.reconciliation.varianceByWeek ?? [];
    if (activeView !== "reconciliation" || activeFieldFilter === "all") return rows;
    return rows.filter((row) => row.weekLabel === activeFieldFilter);
  }, [activeFieldFilter, activeView, data?.reconciliation.varianceByWeek]);

  const activeFieldOptions = useMemo(() => {
    if (activeView === "materials") return getUniqueOptions((data?.topMaterials ?? []).map((row) => row.label));
    if (activeView === "exposure") return getUniqueOptions((data?.queues.balances ?? []).map((row) => row.employee.name));
    if (activeView === "pending-sales") return getUniqueOptions((data?.queues.pendingSales ?? []).map((row) => row.batch.batchNumber));
    if (activeView === "supplier-payments") {
      return getUniqueOptions((data?.queues.pendingSupplierPayments ?? []).map((row) => row.sellerName || "Unknown supplier"));
    }
    if (activeView === "wac") return getUniqueOptions((data?.weightedAverageCostByMaterial ?? []).map((row) => row.label));
    if (activeView === "supplier-margin") return getUniqueOptions((data?.supplierPerformance ?? []).map((row) => row.supplier));
    if (activeView === "reconciliation") return getUniqueOptions((data?.reconciliation.varianceByWeek ?? []).map((row) => row.weekLabel));
    return [];
  }, [activeView, data]);

  const views = [
    { id: "materials", label: "Material mix", count: materialRows.length },
    { id: "exposure", label: "Operator exposure", count: exposureRows.length },
    { id: "pending-sales", label: "Pending sales", count: pendingSalesRows.length },
    { id: "supplier-payments", label: "Supplier payments", count: supplierPaymentRows.length },
    { id: "wac", label: "Weighted avg cost", count: wacRows.length },
    { id: "supplier-margin", label: "Supplier margin", count: supplierMarginRows.length },
    { id: "reconciliation", label: "Reconciliation", count: reconciliationRows.length },
  ];

  const filterToolbar = (
    <div className="flex flex-wrap items-center gap-2">
      <div className="text-xs text-muted-foreground">Field filter</div>
      <Select
        value={activeFieldFilter}
        onValueChange={(value) =>
          setFieldFilters((current) => ({
            ...current,
            [activeView]: value,
          }))
        }
      >
        <SelectTrigger size="sm" className="w-[220px] bg-[var(--surface-base)]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All</SelectItem>
          {activeFieldOptions.map((option) => (
            <SelectItem key={option} value={option}>
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        onClick={() =>
          setFieldFilters((current) => ({
            ...current,
            [activeView]: "all",
          }))
        }
      >
        Clear
      </Button>
    </div>
  );

  return (
    <ScrapShell
      title="Reports"
      actions={
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" variant="outline">
            <Link href="/scrap-metal/reports/daily-snapshot">Open Snapshot Charts</Link>
          </Button>
        </div>
      }
    >
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-[var(--edge-subtle)] bg-[var(--surface-muted)] p-3">
        <div className="min-w-[180px] space-y-1">
          <div className="text-xs text-muted-foreground">Window</div>
          <Select value={windowMode} onValueChange={(value) => setWindowMode(value as SnapshotWindowMode)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="day">Daily</SelectItem>
              <SelectItem value="week">Weekly</SelectItem>
              <SelectItem value="month">Monthly</SelectItem>
              <SelectItem value="all">All Time</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-[180px] space-y-1">
          <div className="text-xs text-muted-foreground">Anchor Date</div>
          <Input type="date" value={anchorDate} onChange={(event) => setAnchorDate(event.target.value)} />
        </div>
      </div>

      {data ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Tickets / Hour</CardTitle></CardHeader><CardContent className="font-mono text-lg">{data.summary.ticketsProcessedPerHour.toFixed(2)}</CardContent></Card>
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Pending Supplier Payments</CardTitle></CardHeader><CardContent className="font-mono text-lg">{data.summary.pendingSupplierPaymentsCount}</CardContent></Card>
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Pending Approval Age (days)</CardTitle></CardHeader><CardContent className="font-mono text-lg">{data.summary.averagePendingApprovalAgeDays.toFixed(2)}</CardContent></Card>
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Balance Integrity Delta</CardTitle></CardHeader><CardContent className="font-mono text-lg">USD {data.summary.balanceIntegrityDifference.toFixed(2)}</CardContent></Card>
        </div>
      ) : null}

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to load reports</AlertTitle>
          <AlertDescription>{getApiErrorMessage(error)}</AlertDescription>
        </Alert>
      ) : null}

      <VerticalDataViews items={views} value={activeView} onValueChange={setActiveView} railLabel="Views">
        {activeView === "materials" ? (
          <DataTable
            data={materialRows}
            columns={materialColumns}
            toolbar={filterToolbar}
            pagination={{ enabled: true }}
            searchPlaceholder="Search material mix"
            emptyState={isLoading ? "Loading..." : "No data"}
            mobileCardRenderer={({ row }) => (
              <ScrapMobileCard>
                <ScrapMobileCardHeader title={row.label} />
                <ScrapMobileMetricStrip
                  items={[
                    { icon: Scale, value: `${row.purchaseWeight.toFixed(2)} kg`, srLabel: "Bought weight" },
                    { icon: Package, value: `${row.saleWeight.toFixed(2)} kg`, srLabel: "Sold weight" },
                    { icon: Wallet, value: `USD ${row.purchaseValue.toFixed(2)}`, srLabel: "Buy value" },
                    { icon: Coins, value: `USD ${row.saleValue.toFixed(2)}`, srLabel: "Sell value" },
                  ]}
                />
              </ScrapMobileCard>
            )}
          />
        ) : null}
        {activeView === "exposure" ? (
          <DataTable
            data={exposureRows}
            columns={exposureColumns}
            toolbar={filterToolbar}
            pagination={{ enabled: true }}
            searchPlaceholder="Search operator exposure"
            emptyState={isLoading ? "Loading..." : "No data"}
            mobileCardRenderer={({ row }) => (
              <ScrapMobileCard>
                <ScrapMobileCardHeader title={row.employee.name} subtitle={row.employee.employeeId} />
                <ScrapMobileMetricStrip items={[{ icon: Wallet, value: `USD ${row.balance.toFixed(2)}`, srLabel: "Balance" }]} />
              </ScrapMobileCard>
            )}
          />
        ) : null}
        {activeView === "pending-sales" ? (
          <DataTable
            data={pendingSalesRows}
            columns={pendingSalesColumns}
            toolbar={filterToolbar}
            pagination={{ enabled: true }}
            searchPlaceholder="Search pending sales"
            emptyState={isLoading ? "Loading..." : "No data"}
            mobileCardRenderer={({ row }) => (
              <ScrapMobileCard>
                <ScrapMobileCardHeader title={row.buyerName} subtitle={row.batch.batchNumber} />
                <ScrapMobileMetricStrip
                  items={[
                    { icon: Scale, value: `${row.soldWeight.toFixed(2)} kg`, srLabel: "Weight" },
                    { icon: Wallet, value: `USD ${row.totalAmount.toFixed(2)}`, srLabel: "Value" },
                    { icon: ReceiptLong, value: row.status, srLabel: "Status" },
                  ]}
                />
              </ScrapMobileCard>
            )}
          />
        ) : null}
        {activeView === "supplier-payments" ? (
          <DataTable
            data={supplierPaymentRows}
            columns={supplierPaymentColumns}
            toolbar={filterToolbar}
            pagination={{ enabled: true }}
            searchPlaceholder="Search supplier payments"
            emptyState={isLoading ? "Loading..." : "No data"}
            mobileCardRenderer={({ row }) => (
              <ScrapMobileCard>
                <ScrapMobileCardHeader title={row.purchaseNumber} subtitle={row.sellerName ?? "Unknown supplier"} />
                <ScrapMobileMetricStrip
                  items={[
                    { icon: Calendar, value: new Date(row.purchaseDate).toLocaleDateString(), srLabel: "Purchase date" },
                    { icon: Wallet, value: `${row.currency} ${row.totalAmount.toFixed(2)}`, srLabel: "Amount" },
                  ]}
                />
              </ScrapMobileCard>
            )}
          />
        ) : null}
        {activeView === "wac" ? (
          <DataTable
            data={wacRows}
            columns={weightedAverageCostColumns}
            toolbar={filterToolbar}
            pagination={{ enabled: true }}
            searchPlaceholder="Search weighted average cost"
            emptyState={isLoading ? "Loading..." : "No data"}
          />
        ) : null}
        {activeView === "supplier-margin" ? (
          <DataTable
            data={supplierMarginRows}
            columns={supplierPerformanceColumns}
            toolbar={filterToolbar}
            pagination={{ enabled: true }}
            searchPlaceholder="Search supplier margin"
            emptyState={isLoading ? "Loading..." : "No data"}
          />
        ) : null}
        {activeView === "reconciliation" ? (
          <DataTable
            data={reconciliationRows}
            columns={reconciliationColumns}
            toolbar={filterToolbar}
            pagination={{ enabled: true }}
            searchPlaceholder="Search reconciliation"
            emptyState={isLoading ? "Loading..." : "No data"}
          />
        ) : null}
      </VerticalDataViews>
    </ScrapShell>
  );
}
