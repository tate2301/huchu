"use client";

import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useQuery } from "@tanstack/react-query";
import { RetailShell } from "@/components/retail/retail-shell";
import { DataTable } from "@/components/ui/data-table";
import { NumericCell } from "@/components/ui/numeric-cell";
import { VerticalDataViews } from "@/components/ui/vertical-data-views";
import { fetchJson } from "@/lib/api-client";

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

  const trendPeak = Math.max(...(data?.salesTrend.map((bucket) => bucket.sales) ?? [1]), 1);

  return (
    <RetailShell
      title="Reports"
      description="Scan retail performance, tender mix, and stock exceptions."
    >
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-2xl bg-[var(--surface-muted)] px-4 py-4">
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Sales trend</div>
          <div className="mt-4 grid gap-2 grid-cols-7">
            {(data?.salesTrend ?? []).map((bucket) => (
              <div key={bucket.id} className="rounded-2xl bg-[var(--surface-base)] px-2 py-3">
                <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">{bucket.label}</div>
                <div className="mt-3 flex h-14 items-end">
                  <div className="w-7 rounded-full bg-[#d1a45a]" style={{ height: `${Math.max(8, (bucket.sales / trendPeak) * 56)}px` }} />
                </div>
                <div className="mt-2 font-mono text-xs">{bucket.sales.toFixed(0)}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-2xl bg-[var(--surface-muted)] px-4 py-4">
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Tender mix</div>
          <div className="mt-4 space-y-2">
            {(data?.tenderMix ?? []).map((row) => (
              <div key={row.tenderType} className="flex items-center justify-between gap-3 text-sm">
                <span>{row.tenderType.replaceAll("_", " ")}</span>
                <span className="font-mono">{row.amount.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

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
            toolbar={<span className="text-xs text-[var(--text-muted)]">Best-performing items</span>}
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
            toolbar={<span className="text-xs text-[var(--text-muted)]">Recent posted tickets</span>}
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
            toolbar={<span className="text-xs text-[var(--text-muted)]">Low-stock watchlist</span>}
          />
        ) : null}
      </VerticalDataViews>
    </RetailShell>
  );
}
