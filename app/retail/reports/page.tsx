"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AdminTrendChart,
  AdminDonutChart,
  AdminDualBarChart,
  AdminDistributionChart,
} from "@/components/charts/admin-headless-charts";
import { RetailShell } from "@/components/retail/retail-shell";
import { ReportChartShell } from "@/components/retail/reports/report-chart-shell";
import { ReportFilterBar } from "@/components/retail/reports/report-filter-bar";
import { ReportBigNumber } from "@/components/retail/reports/report-big-number";
import { DataTable } from "@/components/ui/data-table";
import { NumericCell } from "@/components/ui/numeric-cell";
import { fetchJson } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import {
  BarChart3,
  Wallet,
  Package,
  Clock,
  Storefront,
  ReceiptLong,
} from "@/lib/icons";
import type { ColumnDef } from "@tanstack/react-table";

/* â”€â”€ types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
type SaleRow = {
  id: string;
  saleNo: string;
  saleType: string;
  status: string;
  cashierName: string | null;
  customerName: string | null;
  postedAt: string;
  totalAmount: number;
  itemCount: number;
  tenderTypes: string[];
};

type ShiftRow = {
  id: string;
  shiftNo: string;
  registerName: string;
  site: { name: string } | null;
  cashierName: string;
  openingFloat: number;
  expectedCash: number;
  countedCash: number | null;
  variance: number | null;
  status: string;
  openedAt: string;
  salesValue: number;
  saleCount: number;
};

type StockItem = {
  id: string;
  itemCode: string;
  name: string;
  currentStock: number;
  minStock: number;
  unit: string;
};

const TABS = [
  { id: "pos-policy", label: "POS Policy", icon: ReceiptLong },
  { id: "operations", label: "Operations", icon: Storefront },
  { id: "reports", label: "Reports", icon: BarChart3 },
  { id: "stock", label: "Stock Overview", icon: Package },
  { id: "sales", label: "Sales", icon: Wallet },
  { id: "shifts", label: "Shifts", icon: Clock },
] as const;

function money(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function dateLabel(iso: string) {
  return new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" });
}

/* â”€â”€ main page â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
export default function RetailReportsHubPage() {
  const [activeTab, setActiveTab] = useState<string>("operations");

  /* Shared data queries */
  const salesQuery = useQuery({
    queryKey: ["retail-reports-sales"],
    queryFn: () => fetchJson<{ data: SaleRow[]; summary: Record<string, number> }>("/api/v2/retail/pos/sales?limit=200"),
  });
  const shiftsQuery = useQuery({
    queryKey: ["retail-reports-shifts"],
    queryFn: () => fetchJson<{ data: ShiftRow[] }>("/api/v2/retail/shifts"),
  });
  const stockQuery = useQuery({
    queryKey: ["retail-reports-stock"],
    queryFn: () => fetchJson<{ summary: { lowStockCount: number }; lowStock: StockItem[] }>("/api/v2/retail"),
  });
  const sales = useMemo(() => salesQuery.data?.data ?? [], [salesQuery.data?.data]);
  const shifts = useMemo(() => shiftsQuery.data?.data ?? [], [shiftsQuery.data?.data]);
  const stockItems = useMemo(() => stockQuery.data?.lowStock ?? [], [stockQuery.data?.lowStock]);

  /* â”€â”€ derived data â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  const salesTrend = useMemo(() => {
    const buckets = new Map<string, { label: string; sales: number; refunds: number; voids: number; tickets: number }>();
    for (const s of sales) {
      const key = s.postedAt.slice(0, 10);
      const label = dateLabel(s.postedAt);
      const cur = buckets.get(key) ?? { label, sales: 0, refunds: 0, voids: 0, tickets: 0 };
      cur.tickets++;
      if (s.saleType === "REFUND") cur.refunds += Math.abs(s.totalAmount);
      else if (s.saleType === "VOID" || s.status === "VOIDED") cur.voids += Math.abs(s.totalAmount);
      else cur.sales += s.totalAmount;
      buckets.set(key, cur);
    }
    return Array.from(buckets.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([id, v]) => ({ id, label: v.label, sales: v.sales, refunds: v.refunds, voids: v.voids, tickets: v.tickets }));
  }, [sales]);

  const tenderMix = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of sales) {
      for (const t of s.tenderTypes) {
        counts.set(t, (counts.get(t) ?? 0) + 1);
      }
    }
    return Array.from(counts.entries()).map(([label, value]) => ({ id: label, label, value }));
  }, [sales]);

  const typeMix = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of sales) {
      const key = s.saleType === "SALE" ? "Sales" : s.saleType === "REFUND" ? "Refunds" : "Voids";
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return Array.from(counts.entries()).map(([label, value]) => ({
      id: label, label, value,
      tone: label === "Sales" ? ("success" as const) : label === "Refunds" ? ("warning" as const) : ("danger" as const),
    }));
  }, [sales]);

  const shiftTrend = useMemo(() => {
    const buckets = new Map<string, { label: string; sales: number; variance: number; count: number }>();
    for (const s of shifts) {
      const key = s.openedAt.slice(0, 10);
      const label = dateLabel(s.openedAt);
      const cur = buckets.get(key) ?? { label, sales: 0, variance: 0, count: 0 };
      cur.sales += s.salesValue;
      cur.variance += Math.abs(s.variance ?? 0);
      cur.count++;
      buckets.set(key, cur);
    }
    return Array.from(buckets.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([id, v]) => ({ id, label: v.label, sales: v.sales, variance: v.variance, count: v.count }));
  }, [shifts]);

  const shiftStatus = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of shifts) counts.set(s.status, (counts.get(s.status) ?? 0) + 1);
    return Array.from(counts.entries()).map(([label, value]) => ({
      id: label, label, value,
      tone: label === "OPEN" ? ("success" as const) : ("default" as const),
    }));
  }, [shifts]);

  const topCashiers = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of sales) counts.set(s.cashierName ?? "Unknown", (counts.get(s.cashierName ?? "Unknown") ?? 0) + 1);
    return Array.from(counts.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 8)
      .map(([label, value]) => ({ id: label, label, value }));
  }, [sales]);

  const topTickets = useMemo(() =>
    sales
      .slice()
      .sort((a, b) => b.totalAmount - a.totalAmount)
      .slice(0, 8)
      .map((s) => ({ id: s.id, label: s.saleNo, primary: s.totalAmount, secondary: s.itemCount })),
    [sales],
  );

  const stockHealth = useMemo(() => [
    { id: "ok", label: "OK", value: stockItems.filter((i) => i.currentStock > i.minStock).length, tone: "success" as const },
    { id: "low", label: "Low", value: stockItems.filter((i) => i.currentStock > 0 && i.currentStock <= i.minStock).length, tone: "warning" as const },
    { id: "critical", label: "Critical", value: stockItems.filter((i) => i.currentStock <= 0).length, tone: "danger" as const },
  ], [stockItems]);

  const stockGap = useMemo(() =>
    stockItems
      .slice()
      .sort((a, b) => (b.minStock - b.currentStock) - (a.minStock - a.currentStock))
      .slice(0, 8)
      .map((i) => ({ id: i.id, label: i.name, value: Math.max(i.minStock - i.currentStock, 0), tone: ("warning" as const) })),
    [stockItems],
  );

  /* â”€â”€ table columns â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  const saleColumns: ColumnDef<SaleRow>[] = useMemo(() => [
    { id: "saleNo", header: "Transaction", cell: ({ row }) => <div className="font-mono font-semibold">{row.original.saleNo}</div> },
    { id: "type", header: "Type", cell: ({ row }) => row.original.saleType },
    { id: "postedAt", header: "Posted", cell: ({ row }) => dateLabel(row.original.postedAt) },
    { id: "cashier", header: "Cashier", cell: ({ row }) => row.original.cashierName ?? "-" },
    { id: "customer", header: "Customer", cell: ({ row }) => row.original.customerName ?? "Walk-in" },
    { id: "total", header: "Total", cell: ({ row }) => <NumericCell>{money(row.original.totalAmount)}</NumericCell> },
    { id: "items", header: "Items", cell: ({ row }) => <NumericCell>{row.original.itemCount}</NumericCell> },
  ], []);

  const shiftColumns: ColumnDef<ShiftRow>[] = useMemo(() => [
    { id: "shiftNo", header: "Shift", cell: ({ row }) => <div className="font-mono font-semibold">{row.original.shiftNo}</div> },
    { id: "register", header: "Register", cell: ({ row }) => row.original.registerName },
    { id: "cashier", header: "Cashier", cell: ({ row }) => row.original.cashierName },
    { id: "status", header: "Status", cell: ({ row }) => row.original.status },
    { id: "sales", header: "Sales", cell: ({ row }) => <NumericCell>{money(row.original.salesValue)}</NumericCell> },
    { id: "variance", header: "Variance", cell: ({ row }) => <NumericCell>{money(Math.abs(row.original.variance ?? 0))}</NumericCell> },
  ], []);

  const netSales = salesQuery.data?.summary.netSales ?? 0;
  const grossSales = salesQuery.data?.summary.grossSales ?? 0;
  const openShifts = shifts.filter((s) => s.status === "OPEN").length;

  /* â”€â”€ render â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  return (
    <RetailShell title="Reports" actions={undefined}>
      {/* Tab bar */}
      <div className="flex gap-1 overflow-x-auto rounded-2xl bg-[var(--surface-muted)] p-1">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex items-center gap-2 whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-medium transition-all",
                active
                  ? "bg-[var(--surface-base)] text-[var(--text-strong)] shadow-sm"
                  : "text-[var(--text-muted)] hover:text-[var(--text-strong)]",
              )}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* â”€â”€ OPERATIONS TAB â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      {activeTab === "operations" && (
        <div className="space-y-5">
          <ReportFilterBar onExport={() => {}} />
          <div className="grid gap-5 xl:grid-cols-3">
            <ReportChartShell title="Net sales" sourceTag={{ label: "Sales" }}>
              <ReportBigNumber label="Net" value={money(netSales)} />
            </ReportChartShell>
            <ReportChartShell title="Gross sales" sourceTag={{ label: "Sales" }}>
              <ReportBigNumber label="Gross" value={money(grossSales)} dotColor="var(--status-success-border)" />
            </ReportChartShell>
            <ReportChartShell title="Transactions" sourceTag={{ label: "POS" }}>
              <ReportBigNumber label="Total tickets" value={sales.length.toString()} dotColor="var(--status-info-border)" />
            </ReportChartShell>
          </div>
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(300px,0.8fr)]">
            <ReportChartShell title="Sales trend" sourceTag={{ label: "POS" }} legend={[{ label: "Sales", color: "var(--status-success-border)" }, { label: "Refunds", color: "var(--status-warning-border)" }, { label: "Voids", color: "var(--status-danger-border)" }]}>
              <AdminTrendChart rows={salesTrend} series={[
                { key: "sales", label: "Sales", kind: "area", tone: "success", fillOpacity: 0.12 },
                { key: "refunds", label: "Refunds", kind: "line", tone: "warning", dashed: true },
                { key: "voids", label: "Voids", kind: "line", tone: "danger", dashed: true },
              ]} height={280} valueFormatter={money} yTickFormatter={money} />
            </ReportChartShell>
            <ReportChartShell title="Transaction mix" sourceTag={{ label: "POS" }}>
              <AdminDonutChart rows={typeMix} valueLabel="Transactions" valueFormatter={(v) => v.toString()} height={280} />
            </ReportChartShell>
          </div>
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(300px,0.8fr)]">
            <ReportChartShell title="Tender distribution" sourceTag={{ label: "Payments" }}>
              <AdminDistributionChart rows={tenderMix} valueLabel="Count" valueFormatter={(v) => v.toString()} height={260} />
            </ReportChartShell>
            <ReportChartShell title="Top cashiers" sourceTag={{ label: "Staff" }}>
              <AdminDistributionChart rows={topCashiers} valueLabel="Txns" valueFormatter={(v) => v.toString()} height={260} />
            </ReportChartShell>
          </div>
          <DataTable data={sales} columns={saleColumns} features={{ sorting: true, globalFilter: true, pagination: true }} pagination={{ enabled: true, server: false }} searchPlaceholder="Search transactions" />
        </div>
      )}

      {/* â”€â”€ POS POLICY TAB â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      {activeTab === "pos-policy" && (
        <div className="space-y-5">
          <ReportFilterBar onExport={() => {}} />
          <div className="grid gap-5 xl:grid-cols-3">
            <ReportChartShell title="Total transactions" sourceTag={{ label: "POS" }}>
              <ReportBigNumber label="Transactions" value={sales.length.toString()} />
            </ReportChartShell>
            <ReportChartShell title="Average ticket" sourceTag={{ label: "POS" }}>
              <ReportBigNumber label="Avg ticket" value={money(sales.length ? sales.reduce((s, r) => s + r.totalAmount, 0) / sales.length : 0)} dotColor="var(--status-success-border)" />
            </ReportChartShell>
            <ReportChartShell title="Exceptions" sourceTag={{ label: "POS" }}>
              <ReportBigNumber label="Voids + Refunds" value={(sales.filter((s) => s.saleType !== "SALE").length).toString()} dotColor="var(--status-danger-border)" />
            </ReportChartShell>
          </div>
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(300px,0.8fr)]">
            <ReportChartShell title="Daily volume" sourceTag={{ label: "POS" }} legend={[{ label: "Tickets", color: "var(--action-primary-bg)" }]}>
              <AdminTrendChart rows={salesTrend} series={[
                { key: "tickets", label: "Tickets", kind: "bar", tone: "default" },
              ]} height={280} valueFormatter={(v) => v.toString()} />
            </ReportChartShell>
            <ReportChartShell title="Type breakdown" sourceTag={{ label: "POS" }}>
              <AdminDonutChart rows={typeMix} valueLabel="Transactions" valueFormatter={(v) => v.toString()} height={280} />
            </ReportChartShell>
          </div>
          <DataTable data={sales} columns={saleColumns} features={{ sorting: true, globalFilter: true, pagination: true }} pagination={{ enabled: true, server: false }} searchPlaceholder="Search transactions" />
        </div>
      )}

      {/* â”€â”€ REPORTS TAB â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      {activeTab === "reports" && (
        <div className="space-y-5">
          <ReportFilterBar onExport={() => {}} />
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(300px,0.8fr)]">
            <ReportChartShell title="Sales by day" sourceTag={{ label: "Sales" }} legend={[{ label: "Sales", color: "var(--status-success-border)" }, { label: "Refunds", color: "var(--status-warning-border)" }]}>
              <AdminTrendChart rows={salesTrend} series={[
                { key: "sales", label: "Sales", kind: "area", tone: "success", fillOpacity: 0.12 },
                { key: "refunds", label: "Refunds", kind: "line", tone: "warning", dashed: true },
              ]} height={300} valueFormatter={money} yTickFormatter={money} />
            </ReportChartShell>
            <ReportChartShell title="Transaction value" sourceTag={{ label: "POS" }}>
              <AdminDonutChart rows={typeMix} valueLabel="Value" valueFormatter={(v) => v.toString()} height={300} />
            </ReportChartShell>
          </div>
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(300px,0.8fr)]">
            <ReportChartShell title="Largest tickets" sourceTag={{ label: "Sales" }} legend={[{ label: "Amount", color: "var(--action-primary-bg)" }, { label: "Items", color: "var(--status-info-border)" }]}>
              <AdminDualBarChart rows={topTickets} primaryLabel="Amount" secondaryLabel="Items" height={280} valueFormatter={money} />
            </ReportChartShell>
            <ReportChartShell title="Tender mix" sourceTag={{ label: "Payments" }}>
              <AdminDistributionChart rows={tenderMix} valueLabel="Count" valueFormatter={(v) => v.toString()} height={280} />
            </ReportChartShell>
          </div>
          <DataTable data={sales} columns={saleColumns} features={{ sorting: true, globalFilter: true, pagination: true }} pagination={{ enabled: true, server: false }} searchPlaceholder="Search transactions" />
        </div>
      )}

      {/* â”€â”€ STOCK TAB â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      {activeTab === "stock" && (
        <div className="space-y-5">
          <ReportFilterBar onExport={() => {}} />
          <div className="grid gap-5 xl:grid-cols-3">
            <ReportChartShell title="Total SKUs" sourceTag={{ label: "Inventory" }}>
              <ReportBigNumber label="Low-stock SKUs" value={stockItems.length.toString()} dotColor="var(--status-warning-border)" />
            </ReportChartShell>
            <ReportChartShell title="Stock health" sourceTag={{ label: "Inventory" }}>
              <ReportBigNumber label="Critical" value={stockItems.filter((i) => i.currentStock <= 0).length.toString()} dotColor="var(--status-danger-border)" />
            </ReportChartShell>
            <ReportChartShell title="Reorder gap" sourceTag={{ label: "Inventory" }}>
              <ReportBigNumber label="Items below min" value={stockItems.filter((i) => i.currentStock <= i.minStock).length.toString()} dotColor="var(--status-warning-border)" />
            </ReportChartShell>
          </div>
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(300px,0.8fr)]">
            <ReportChartShell title="Stock gaps" sourceTag={{ label: "Inventory" }}>
              <AdminDistributionChart rows={stockGap} valueLabel="Shortfall" valueFormatter={(v) => v.toFixed(0)} height={280} />
            </ReportChartShell>
            <ReportChartShell title="Health overview" sourceTag={{ label: "Inventory" }}>
              <AdminDonutChart rows={stockHealth} valueLabel="SKUs" valueFormatter={(v) => v.toString()} height={280} />
            </ReportChartShell>
          </div>
        </div>
      )}

      {/* â”€â”€ SALES TAB â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      {activeTab === "sales" && (
        <div className="space-y-5">
          <ReportFilterBar onExport={() => {}} />
          <div className="grid gap-5 xl:grid-cols-3">
            <ReportChartShell title="Gross sales" sourceTag={{ label: "Sales" }}>
              <ReportBigNumber label="Gross" value={money(grossSales)} />
            </ReportChartShell>
            <ReportChartShell title="Net sales" sourceTag={{ label: "Sales" }}>
              <ReportBigNumber label="Net" value={money(netSales)} dotColor="var(--status-success-border)" />
            </ReportChartShell>
            <ReportChartShell title="Ticket count" sourceTag={{ label: "POS" }}>
              <ReportBigNumber label="Tickets" value={sales.length.toString()} dotColor="var(--status-info-border)" />
            </ReportChartShell>
          </div>
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(300px,0.8fr)]">
            <ReportChartShell title="Sales trend" sourceTag={{ label: "Sales" }} legend={[{ label: "Sales", color: "var(--status-success-border)" }, { label: "Refunds", color: "var(--status-warning-border)" }]}>
              <AdminTrendChart rows={salesTrend} series={[
                { key: "sales", label: "Sales", kind: "area", tone: "success", fillOpacity: 0.12 },
                { key: "refunds", label: "Refunds", kind: "line", tone: "warning", dashed: true },
              ]} height={280} valueFormatter={money} yTickFormatter={money} />
            </ReportChartShell>
            <ReportChartShell title="Top tickets" sourceTag={{ label: "Sales" }}>
              <AdminDualBarChart rows={topTickets.slice(0, 6)} primaryLabel="Amount" secondaryLabel="Items" height={280} valueFormatter={money} />
            </ReportChartShell>
          </div>
          <DataTable data={sales} columns={saleColumns} features={{ sorting: true, globalFilter: true, pagination: true }} pagination={{ enabled: true, server: false }} searchPlaceholder="Search sales" />
        </div>
      )}

      {/* â”€â”€ SHIFTS TAB â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      {activeTab === "shifts" && (
        <div className="space-y-5">
          <ReportFilterBar onExport={() => {}} />
          <div className="grid gap-5 xl:grid-cols-3">
            <ReportChartShell title="Open shifts" sourceTag={{ label: "Shifts" }}>
              <ReportBigNumber label="Open" value={openShifts.toString()} dotColor={openShifts > 0 ? "var(--status-success-border)" : "var(--text-muted)"} />
            </ReportChartShell>
            <ReportChartShell title="Total shifts" sourceTag={{ label: "Shifts" }}>
              <ReportBigNumber label="Total" value={shifts.length.toString()} dotColor="var(--status-info-border)" />
            </ReportChartShell>
            <ReportChartShell title="Shift sales" sourceTag={{ label: "Shifts" }}>
              <ReportBigNumber label="Total sales" value={money(shifts.reduce((s, sh) => s + sh.salesValue, 0))} dotColor="var(--action-primary-bg)" />
            </ReportChartShell>
          </div>
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(300px,0.8fr)]">
            <ReportChartShell title="Sales by shift" sourceTag={{ label: "Shifts" }} legend={[{ label: "Sales", color: "var(--status-success-border)" }, { label: "Variance", color: "var(--status-warning-border)" }]}>
              <AdminTrendChart rows={shiftTrend} series={[
                { key: "sales", label: "Sales", kind: "area", tone: "success", fillOpacity: 0.12 },
                { key: "variance", label: "Variance", kind: "line", tone: "warning", dashed: true },
              ]} height={280} valueFormatter={money} yTickFormatter={money} />
            </ReportChartShell>
            <ReportChartShell title="Status" sourceTag={{ label: "Shifts" }}>
              <AdminDonutChart rows={shiftStatus} valueLabel="Shifts" valueFormatter={(v) => v.toString()} height={280} />
            </ReportChartShell>
          </div>
          <DataTable data={shifts} columns={shiftColumns} features={{ sorting: true, globalFilter: true, pagination: true }} pagination={{ enabled: true, server: false }} searchPlaceholder="Search shifts" />
        </div>
      )}
    </RetailShell>
  );
}
