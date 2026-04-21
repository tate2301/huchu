"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useQuery } from "@tanstack/react-query";
import {
  AdminDistributionChart,
  AdminDualBarChart,
  AdminDonutChart,
  AdminTrendChart,
} from "@/components/charts/admin-headless-charts";
import { RetailShell } from "@/components/retail/retail-shell";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { NumericCell } from "@/components/ui/numeric-cell";
import { VerticalDataViews } from "@/components/ui/vertical-data-views";
import { fetchJson } from "@/lib/api-client";
import { ClipboardList, LocalShipping, ReceiptLong } from "@/lib/icons";

type RetailDashboardPayload = {
  salesTrend: Array<{ id: string; label: string; sales: number; tickets: number }>;
  tenderMix: Array<{ tenderType: string; amount: number }>;
  topItems: Array<{ itemName: string; quantity: number; value: number }>;
  recentSales: Array<{ id: string; saleNo: string; postedAt: string; cashierName: string | null; totalAmount: number; itemCount: number; tenderTypes: string[] }>;
  lowStock: Array<{ id: string; itemCode: string; name: string; currentStock: number; minStock: number; unit: string }>;
};

export default function RetailReportsPage() {
  const [activeView, setActiveView] = useState("items");
  const { data, isLoading } = useQuery({
    queryKey: ["retail-reports-overview"],
    queryFn: () => fetchJson<RetailDashboardPayload>("/api/v2/retail"),
  });

  const itemColumns = useMemo<ColumnDef<RetailDashboardPayload["topItems"][number]>[]>(
    () => [
      { id: "itemName", header: "Item", cell: ({ row }) => row.original.itemName },
      { id: "quantity", header: "Units", cell: ({ row }) => <NumericCell>{row.original.quantity.toFixed(2)}</NumericCell> },
      { id: "value", header: "Sales", cell: ({ row }) => <NumericCell>{row.original.value.toFixed(2)}</NumericCell> },
    ],
    [],
  );
  const salesColumns = useMemo<ColumnDef<RetailDashboardPayload["recentSales"][number]>[]>(
    () => [
      { id: "saleNo", header: "Sale #", cell: ({ row }) => <span className="font-mono">{row.original.saleNo}</span> },
      { id: "postedAt", header: "Date", cell: ({ row }) => <NumericCell align="left">{new Date(row.original.postedAt).toLocaleDateString()}</NumericCell> },
      { id: "cashierName", header: "Cashier", cell: ({ row }) => row.original.cashierName ?? "-" },
      { id: "itemCount", header: "Items", cell: ({ row }) => <NumericCell>{row.original.itemCount}</NumericCell> },
      { id: "totalAmount", header: "Value", cell: ({ row }) => <NumericCell>{row.original.totalAmount.toFixed(2)}</NumericCell> },
    ],
    [],
  );
  const stockColumns = useMemo<ColumnDef<RetailDashboardPayload["lowStock"][number]>[]>(
    () => [
      { id: "name", header: "Item", cell: ({ row }) => row.original.name },
      { id: "itemCode", header: "Code", cell: ({ row }) => <span className="font-mono">{row.original.itemCode}</span> },
      { id: "currentStock", header: "On hand", cell: ({ row }) => <NumericCell>{`${row.original.currentStock.toFixed(2)} ${row.original.unit}`}</NumericCell> },
      { id: "minStock", header: "Min", cell: ({ row }) => <NumericCell>{`${row.original.minStock.toFixed(2)} ${row.original.unit}`}</NumericCell> },
    ],
    [],
  );

  const chartRows = useMemo(
    () =>
      (data?.salesTrend ?? []).map((bucket) => ({
        id: bucket.id,
        label: bucket.label,
        sales: bucket.sales,
        tickets: bucket.tickets,
      })),
    [data?.salesTrend],
  );

  const tenderRows = useMemo(
    () =>
      (data?.tenderMix ?? []).map((row) => ({
        id: row.tenderType,
        label: row.tenderType.replaceAll("_", " "),
        value: row.amount,
      })),
    [data?.tenderMix],
  );

  const topItemRows = useMemo(
    () =>
      (data?.topItems ?? []).slice(0, 8).map((item) => ({
        id: item.itemName,
        label: item.itemName,
        primary: item.value,
        secondary: item.quantity,
      })),
    [data?.topItems],
  );

  const stockRows = useMemo(
    () =>
      (data?.lowStock ?? []).slice(0, 8).map((item) => ({
        id: item.id,
        label: item.itemCode,
        value: Math.max(item.minStock - item.currentStock, 0),
        tone: item.currentStock < item.minStock ? ("warning" as const) : ("success" as const),
      })),
    [data?.lowStock],
  );

  return (
    <RetailShell
      title="Reports"
      actions={
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" variant="outline">
            <Link href="/retail/sales">
              <ClipboardList className="h-4 w-4" />
              Sales Queue
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/retail/purchasing/receipts">
              <LocalShipping className="h-4 w-4" />
              Receipts
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/retail/shifts">
              <ReceiptLong className="h-4 w-4" />
              Shifts & Cash-up
            </Link>
          </Button>
        </div>
      }
    >
      <section className="rounded-[28px] border border-[var(--edge-subtle)] bg-[var(--surface-base)] p-5 shadow-[var(--shadow-card)]">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 className="text-2xl font-semibold text-[var(--text-strong)]">Trend and tender mix</h2>
          <div className="rounded-2xl bg-[var(--surface-subtle)] px-4 py-3 text-right">
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-muted)]">Recent tickets</p>
            <p className="font-mono text-3xl font-semibold text-[var(--text-strong)]">
              {(data?.salesTrend ?? []).reduce((sum, bucket) => sum + bucket.tickets, 0)}
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.85fr)]">
          <AdminTrendChart
            rows={chartRows}
            series={[
              { key: "sales", label: "Sales", kind: "area", tone: "success", fillOpacity: 0.12 },
              { key: "tickets", label: "Tickets", kind: "line", tone: "default", dashed: true },
            ]}
            height={300}
            valueFormatter={(value) => value.toFixed(0)}
            yTickFormatter={(value) => value.toFixed(0)}
            emptyLabel="Sales trend is loading"
          />
          <AdminDonutChart
            rows={tenderRows}
            valueLabel="Tender mix"
            valueFormatter={(value) => value.toFixed(2)}
            height={300}
            emptyLabel="Tender mix is loading"
          />
        </div>
      </section>

      <section className="rounded-[28px] border border-[var(--edge-subtle)] bg-[var(--surface-base)] p-5 shadow-[var(--shadow-card)]">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h3 className="text-xl font-semibold text-[var(--text-strong)]">Top items and stock</h3>
          <div className="rounded-2xl bg-[var(--surface-subtle)] px-4 py-3 text-right">
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-muted)]">Top item value</p>
            <p className="font-mono text-2xl font-semibold text-[var(--text-strong)]">
              {data?.topItems?.[0] ? data.topItems[0].value.toFixed(0) : "0"}
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.75fr)]">
          <AdminDualBarChart
            rows={topItemRows}
            primaryLabel="Sales"
            secondaryLabel="Units"
            height={280}
            valueFormatter={(value) => value.toFixed(0)}
            emptyLabel="Top items are loading"
          />
          <AdminDistributionChart
            rows={stockRows}
            valueLabel="Gap"
            valueFormatter={(value) => value.toFixed(2)}
            height={280}
            emptyLabel="Stock exceptions are loading"
          />
        </div>
      </section>

      <VerticalDataViews
        value={activeView}
        onValueChange={setActiveView}
        railLabel="Reports"
        items={[
          { id: "items", label: "Top items", count: data?.topItems.length ?? 0 },
          { id: "sales", label: "Sales detail", count: data?.recentSales.length ?? 0 },
          { id: "stock", label: "Stock exceptions", count: data?.lowStock.length ?? 0 },
        ]}
      >
        {activeView === "items" ? (
          <DataTable
            data={data?.topItems ?? []}
            columns={itemColumns}
            features={{ sorting: true, globalFilter: true, pagination: true }}
            pagination={{ enabled: true, server: false }}
            searchPlaceholder="Search top items"
            emptyState={isLoading ? "Loading report..." : "No item data yet"}
            toolbar={undefined}
          />
        ) : null}
        {activeView === "sales" ? (
          <DataTable
            data={data?.recentSales ?? []}
            columns={salesColumns}
            features={{ sorting: true, globalFilter: true, pagination: true }}
            pagination={{ enabled: true, server: false }}
            searchPlaceholder="Search sales detail"
            emptyState={isLoading ? "Loading report..." : "No sales yet"}
            toolbar={undefined}
          />
        ) : null}
        {activeView === "stock" ? (
          <DataTable
            data={data?.lowStock ?? []}
            columns={stockColumns}
            features={{ sorting: true, globalFilter: true, pagination: true }}
            pagination={{ enabled: true, server: false }}
            searchPlaceholder="Search stock exceptions"
            emptyState={isLoading ? "Loading report..." : "No stock exceptions"}
            toolbar={undefined}
          />
        ) : null}
      </VerticalDataViews>
    </RetailShell>
  );
}
                                                                      