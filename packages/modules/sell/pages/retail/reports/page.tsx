"use client";

import { useMemo, useState } from "react";
import {
  Alert,
  Card,
  EmptyState,
  Skeleton,
  StatCard,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@corelithzw/react";
import { useQuery } from "@tanstack/react-query";
import {
  AdminTrendChart,
  AdminDonutChart,
  AdminDualBarChart,
  AdminDistributionChart,
} from "@corelithzw/ui/charts/admin-headless-charts";
import { RetailShell } from "../../../components/retail-shell";
import { ReportExportButton } from "../../../components/reports/report-export-button";
import { DataTable } from "@corelithzw/ui/components/data-table";
import { NumericCell } from "@corelithzw/ui/components/numeric-cell";
import { fetchJson, getApiErrorMessage } from "@corelithzw/platform/api-client";
import type { ColumnDef } from "@tanstack/react-table";

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
  { id: "operations", label: "Operations" },
  { id: "pos-policy", label: "Checkout" },
  { id: "reports", label: "Trading" },
  { id: "stock", label: "Stock" },
  { id: "sales", label: "Sales" },
  { id: "shifts", label: "Shifts" },
] as const;

function money(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function count(value: number) {
  return value.toString();
}

function dateLabel(iso: string) {
  return new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" });
}

export default function RetailReportsHubPage() {
  const [activeTab, setActiveTab] = useState<string>("operations");

  const salesQuery = useQuery({
    queryKey: ["retail-reports-sales"],
    queryFn: () =>
      fetchJson<{ data: SaleRow[]; summary: Record<string, number> }>(
        "/api/v2/retail/pos/sales?limit=200",
      ),
  });
  const shiftsQuery = useQuery({
    queryKey: ["retail-reports-shifts"],
    queryFn: () => fetchJson<{ data: ShiftRow[] }>("/api/v2/retail/shifts"),
  });
  const stockQuery = useQuery({
    queryKey: ["retail-reports-stock"],
    queryFn: () =>
      fetchJson<{ summary: { lowStockCount: number }; lowStock: StockItem[] }>("/api/v2/retail"),
  });

  const sales = useMemo(() => salesQuery.data?.data ?? [], [salesQuery.data?.data]);
  const shifts = useMemo(() => shiftsQuery.data?.data ?? [], [shiftsQuery.data?.data]);
  const stockItems = useMemo(() => stockQuery.data?.lowStock ?? [], [stockQuery.data?.lowStock]);

  const salesTrend = useMemo(() => {
    const buckets = new Map<
      string,
      { label: string; sales: number; refunds: number; voids: number; tickets: number }
    >();
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
      .map(([id, v]) => ({
        id,
        label: v.label,
        sales: v.sales,
        refunds: v.refunds,
        voids: v.voids,
        tickets: v.tickets,
      }));
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
      id: label,
      label,
      value,
      tone:
        label === "Sales"
          ? ("success" as const)
          : label === "Refunds"
            ? ("warning" as const)
            : ("danger" as const),
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
      id: label,
      label,
      value,
      tone: label === "OPEN" ? ("success" as const) : ("default" as const),
    }));
  }, [shifts]);

  const topCashiers = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of sales)
      counts.set(s.cashierName ?? "Unknown", (counts.get(s.cashierName ?? "Unknown") ?? 0) + 1);
    return Array.from(counts.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 8)
      .map(([label, value]) => ({ id: label, label, value }));
  }, [sales]);

  const topTickets = useMemo(
    () =>
      sales
        .slice()
        .sort((a, b) => b.totalAmount - a.totalAmount)
        .slice(0, 8)
        .map((s) => ({ id: s.id, label: s.saleNo, primary: s.totalAmount, secondary: s.itemCount })),
    [sales],
  );

  const stockHealth = useMemo(
    () => [
      {
        id: "ok",
        label: "OK",
        value: stockItems.filter((i) => i.currentStock > i.minStock).length,
        tone: "success" as const,
      },
      {
        id: "low",
        label: "Low",
        value: stockItems.filter((i) => i.currentStock > 0 && i.currentStock <= i.minStock).length,
        tone: "warning" as const,
      },
      {
        id: "critical",
        label: "Critical",
        value: stockItems.filter((i) => i.currentStock <= 0).length,
        tone: "danger" as const,
      },
    ],
    [stockItems],
  );

  const stockGap = useMemo(
    () =>
      stockItems
        .slice()
        .sort((a, b) => b.minStock - b.currentStock - (a.minStock - a.currentStock))
        .slice(0, 8)
        .map((i) => ({
          id: i.id,
          label: i.name,
          value: Math.max(i.minStock - i.currentStock, 0),
          tone: "warning" as const,
        })),
    [stockItems],
  );

  const saleColumns: ColumnDef<SaleRow>[] = useMemo(
    () => [
      {
        id: "saleNo",
        header: "Transaction",
        cell: ({ row }) => <div className="font-mono font-semibold">{row.original.saleNo}</div>,
      },
      { id: "type", header: "Type", cell: ({ row }) => row.original.saleType },
      { id: "postedAt", header: "Posted", cell: ({ row }) => dateLabel(row.original.postedAt) },
      { id: "cashier", header: "Cashier", cell: ({ row }) => row.original.cashierName ?? "-" },
      {
        id: "customer",
        header: "Customer",
        cell: ({ row }) => row.original.customerName ?? "Walk-in",
      },
      {
        id: "total",
        header: "Total",
        cell: ({ row }) => <NumericCell>{money(row.original.totalAmount)}</NumericCell>,
      },
      {
        id: "items",
        header: "Items",
        cell: ({ row }) => <NumericCell>{row.original.itemCount}</NumericCell>,
      },
    ],
    [],
  );

  const shiftColumns: ColumnDef<ShiftRow>[] = useMemo(
    () => [
      {
        id: "shiftNo",
        header: "Shift",
        cell: ({ row }) => <div className="font-mono font-semibold">{row.original.shiftNo}</div>,
      },
      { id: "register", header: "Register", cell: ({ row }) => row.original.registerName },
      { id: "cashier", header: "Cashier", cell: ({ row }) => row.original.cashierName },
      { id: "status", header: "Status", cell: ({ row }) => row.original.status },
      {
        id: "sales",
        header: "Sales",
        cell: ({ row }) => <NumericCell>{money(row.original.salesValue)}</NumericCell>,
      },
      {
        id: "variance",
        header: "Variance",
        cell: ({ row }) => (
          <NumericCell>{money(Math.abs(row.original.variance ?? 0))}</NumericCell>
        ),
      },
    ],
    [],
  );

  const netSales = salesQuery.data?.summary.netSales ?? 0;
  const grossSales = salesQuery.data?.summary.grossSales ?? 0;
  const openShifts = shifts.filter((s) => s.status === "OPEN").length;
  const exceptionCount = sales.filter((s) => s.saleType !== "SALE").length;
  const averageTicket = sales.length
    ? sales.reduce((total, row) => total + row.totalAmount, 0) / sales.length
    : 0;

  const isPending = salesQuery.isPending || shiftsQuery.isPending || stockQuery.isPending;
  const failure = salesQuery.error ?? shiftsQuery.error ?? stockQuery.error;

  // One export, on the page header, carrying whatever the open tab is showing.
  // It replaced six copies of a filter bar whose Export button was wired to a
  // no-op and whose filter rules were never read by anything.
  const exportRows = activeTab === "shifts" ? shifts : activeTab === "stock" ? stockItems : sales;
  const exportName =
    activeTab === "shifts"
      ? "retail-shifts.csv"
      : activeTab === "stock"
        ? "retail-low-stock.csv"
        : "retail-transactions.csv";

  const actions = <ReportExportButton data={exportRows} filename={exportName} />;

  if (isPending) {
    return (
      <RetailShell title="Reports" actions={undefined}>
        <div aria-busy="true" aria-live="polite" className="space-y-5">
          <span className="sr-only">Fetching transactions, shifts and stock…</span>
          <Skeleton height={44} />
          <div className="grid gap-5 xl:grid-cols-3">
            <Skeleton height={104} />
            <Skeleton height={104} />
            <Skeleton height={104} />
          </div>
          <Skeleton height={340} />
          <Skeleton height={280} />
        </div>
      </RetailShell>
    );
  }

  if (failure) {
    return (
      <RetailShell title="Reports" actions={undefined}>
        <Alert tone="danger" title="The reports would not load">
          {getApiErrorMessage(failure)}
        </Alert>
      </RetailShell>
    );
  }

  const noSales = (
    <EmptyState
      title="No transactions in this window"
      body="Charts and the transaction list fill in as the tills post sales."
    />
  );

  return (
    <RetailShell title="Reports" actions={actions}>
      <Tabs value={activeTab} onValueChange={setActiveTab} variant="segmented">
        <TabsList aria-label="Report areas">
          {TABS.map((tab) => (
            <TabsTrigger key={tab.id} value={tab.id}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="operations">
          {sales.length === 0 ? (
            noSales
          ) : (
            <div className="space-y-5">
              <div className="grid gap-5 xl:grid-cols-3">
                <StatCard label="Net sales" value={money(netSales)} footer="After refunds and voids" />
                <StatCard label="Gross sales" value={money(grossSales)} footer="Before deductions" />
                <StatCard label="Transactions" value={count(sales.length)} footer="Tickets in this window" />
              </div>
              <div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(300px,0.8fr)]">
                <Card title="Sales trend" subtitle="Sales, refunds and voids by day">
                  <AdminTrendChart
                    rows={salesTrend}
                    series={[
                      { key: "sales", label: "Sales", kind: "area", tone: "success", fillOpacity: 0.12 },
                      { key: "refunds", label: "Refunds", kind: "line", tone: "warning", dashed: true },
                      { key: "voids", label: "Voids", kind: "line", tone: "danger", dashed: true },
                    ]}
                    height={280}
                    valueFormatter={money}
                    yTickFormatter={money}
                  />
                </Card>
                <Card title="Transaction mix">
                  <AdminDonutChart
                    rows={typeMix}
                    valueLabel="Transactions"
                    valueFormatter={count}
                    height={280}
                  />
                </Card>
              </div>
              <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(300px,0.8fr)]">
                <Card title="Tender distribution">
                  <AdminDistributionChart
                    rows={tenderMix}
                    valueLabel="Count"
                    valueFormatter={count}
                    height={260}
                  />
                </Card>
                <Card title="Top cashiers">
                  <AdminDistributionChart
                    rows={topCashiers}
                    valueLabel="Txns"
                    valueFormatter={count}
                    height={260}
                  />
                </Card>
              </div>
              <DataTable
                data={sales}
                columns={saleColumns}
                features={{ sorting: true, globalFilter: true, pagination: true }}
                pagination={{ enabled: true, server: false }}
                searchPlaceholder="Search transactions"
                emptyState="No transactions match that search."
              />
            </div>
          )}
        </TabsContent>

        <TabsContent value="pos-policy">
          {sales.length === 0 ? (
            noSales
          ) : (
            <div className="space-y-5">
              <div className="grid gap-5 xl:grid-cols-3">
                <StatCard label="Transactions" value={count(sales.length)} footer="Tickets in this window" />
                <StatCard label="Average ticket" value={money(averageTicket)} footer="Per transaction" />
                <StatCard
                  label="Exceptions"
                  value={count(exceptionCount)}
                  tone={exceptionCount > 0 ? "warn" : "neutral"}
                  footer="Voids and refunds"
                />
              </div>
              <div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(300px,0.8fr)]">
                <Card title="Daily volume" subtitle="Tickets rung up per day">
                  <AdminTrendChart
                    rows={salesTrend}
                    series={[{ key: "tickets", label: "Tickets", kind: "bar", tone: "default" }]}
                    height={280}
                    valueFormatter={count}
                  />
                </Card>
                <Card title="Type breakdown">
                  <AdminDonutChart
                    rows={typeMix}
                    valueLabel="Transactions"
                    valueFormatter={count}
                    height={280}
                  />
                </Card>
              </div>
              <DataTable
                data={sales}
                columns={saleColumns}
                features={{ sorting: true, globalFilter: true, pagination: true }}
                pagination={{ enabled: true, server: false }}
                searchPlaceholder="Search transactions"
                emptyState="No transactions match that search."
              />
            </div>
          )}
        </TabsContent>

        <TabsContent value="reports">
          {sales.length === 0 ? (
            noSales
          ) : (
            <div className="space-y-5">
              <div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(300px,0.8fr)]">
                <Card title="Sales by day" subtitle="Sales against refunds">
                  <AdminTrendChart
                    rows={salesTrend}
                    series={[
                      { key: "sales", label: "Sales", kind: "area", tone: "success", fillOpacity: 0.12 },
                      { key: "refunds", label: "Refunds", kind: "line", tone: "warning", dashed: true },
                    ]}
                    height={300}
                    valueFormatter={money}
                    yTickFormatter={money}
                  />
                </Card>
                <Card title="Transaction value">
                  <AdminDonutChart
                    rows={typeMix}
                    valueLabel="Value"
                    valueFormatter={count}
                    height={300}
                  />
                </Card>
              </div>
              <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(300px,0.8fr)]">
                <Card title="Largest tickets" subtitle="Amount against item count">
                  <AdminDualBarChart
                    rows={topTickets}
                    primaryLabel="Amount"
                    secondaryLabel="Items"
                    height={280}
                    valueFormatter={money}
                  />
                </Card>
                <Card title="Tender mix">
                  <AdminDistributionChart
                    rows={tenderMix}
                    valueLabel="Count"
                    valueFormatter={count}
                    height={280}
                  />
                </Card>
              </div>
              <DataTable
                data={sales}
                columns={saleColumns}
                features={{ sorting: true, globalFilter: true, pagination: true }}
                pagination={{ enabled: true, server: false }}
                searchPlaceholder="Search transactions"
                emptyState="No transactions match that search."
              />
            </div>
          )}
        </TabsContent>

        <TabsContent value="stock">
          {stockItems.length === 0 ? (
            <EmptyState
              title="Nothing is running low"
              body="Lines fall onto this watchlist once they reach their reorder point."
            />
          ) : (
            <div className="space-y-5">
              <div className="grid gap-5 xl:grid-cols-3">
                <StatCard
                  label="Watchlist"
                  value={count(stockItems.length)}
                  tone="warn"
                  footer="Lines at or under reorder"
                />
                <StatCard
                  label="Out of stock"
                  value={count(stockItems.filter((i) => i.currentStock <= 0).length)}
                  tone="danger"
                  footer="Nothing left on the shelf"
                />
                <StatCard
                  label="Below minimum"
                  value={count(stockItems.filter((i) => i.currentStock <= i.minStock).length)}
                  footer="Order before the weekend"
                />
              </div>
              <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(300px,0.8fr)]">
                <Card title="Stock gaps" subtitle="How far under reorder each line sits">
                  <AdminDistributionChart
                    rows={stockGap}
                    valueLabel="Shortfall"
                    valueFormatter={(v) => v.toFixed(0)}
                    height={280}
                  />
                </Card>
                <Card title="Health overview">
                  <AdminDonutChart
                    rows={stockHealth}
                    valueLabel="SKUs"
                    valueFormatter={count}
                    height={280}
                  />
                </Card>
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="sales">
          {sales.length === 0 ? (
            noSales
          ) : (
            <div className="space-y-5">
              <div className="grid gap-5 xl:grid-cols-3">
                <StatCard label="Gross sales" value={money(grossSales)} footer="Before deductions" />
                <StatCard label="Net sales" value={money(netSales)} footer="After refunds and voids" />
                <StatCard label="Ticket count" value={count(sales.length)} footer="Transactions posted" />
              </div>
              <div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(300px,0.8fr)]">
                <Card title="Sales trend" subtitle="Sales against refunds">
                  <AdminTrendChart
                    rows={salesTrend}
                    series={[
                      { key: "sales", label: "Sales", kind: "area", tone: "success", fillOpacity: 0.12 },
                      { key: "refunds", label: "Refunds", kind: "line", tone: "warning", dashed: true },
                    ]}
                    height={280}
                    valueFormatter={money}
                    yTickFormatter={money}
                  />
                </Card>
                <Card title="Top tickets">
                  <AdminDualBarChart
                    rows={topTickets.slice(0, 6)}
                    primaryLabel="Amount"
                    secondaryLabel="Items"
                    height={280}
                    valueFormatter={money}
                  />
                </Card>
              </div>
              <DataTable
                data={sales}
                columns={saleColumns}
                features={{ sorting: true, globalFilter: true, pagination: true }}
                pagination={{ enabled: true, server: false }}
                searchPlaceholder="Search sales"
                emptyState="No sales match that search."
              />
            </div>
          )}
        </TabsContent>

        <TabsContent value="shifts">
          {shifts.length === 0 ? (
            <EmptyState
              title="No shifts opened yet"
              body="A shift appears here the moment a cashier opens the till with a float."
            />
          ) : (
            <div className="space-y-5">
              <div className="grid gap-5 xl:grid-cols-3">
                <StatCard
                  label="Open shifts"
                  value={count(openShifts)}
                  tone={openShifts > 0 ? "success" : "neutral"}
                  footer="Tills trading now"
                />
                <StatCard label="Total shifts" value={count(shifts.length)} footer="In this window" />
                <StatCard
                  label="Shift sales"
                  value={money(shifts.reduce((s, sh) => s + sh.salesValue, 0))}
                  footer="Across every shift"
                />
              </div>
              <div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(300px,0.8fr)]">
                <Card title="Sales by shift" subtitle="Takings against cash variance">
                  <AdminTrendChart
                    rows={shiftTrend}
                    series={[
                      { key: "sales", label: "Sales", kind: "area", tone: "success", fillOpacity: 0.12 },
                      { key: "variance", label: "Variance", kind: "line", tone: "warning", dashed: true },
                    ]}
                    height={280}
                    valueFormatter={money}
                    yTickFormatter={money}
                  />
                </Card>
                <Card title="Status">
                  <AdminDonutChart
                    rows={shiftStatus}
                    valueLabel="Shifts"
                    valueFormatter={count}
                    height={280}
                  />
                </Card>
              </div>
              <DataTable
                data={shifts}
                columns={shiftColumns}
                features={{ sorting: true, globalFilter: true, pagination: true }}
                pagination={{ enabled: true, server: false }}
                searchPlaceholder="Search shifts"
                emptyState="No shifts match that search."
              />
            </div>
          )}
        </TabsContent>
      </Tabs>
    </RetailShell>
  );
}
