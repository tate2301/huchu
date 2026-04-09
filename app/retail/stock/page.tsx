"use client";

import Link from "next/link";
import { useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useQuery } from "@tanstack/react-query";
import { RetailShell } from "@/components/retail/retail-shell";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { NumericCell } from "@/components/ui/numeric-cell";
import { fetchJson } from "@/lib/api-client";
import { BarChart3, LocalShipping, Package, ReceiptLong, Scale, TableRows } from "@/lib/icons";

type RetailDashboardPayload = {
  summary: {
    goodsReceivedValue: number;
    openOrderValue: number;
    lowStockCount: number;
  };
  lowStock: Array<{
    id: string;
    itemCode: string;
    name: string;
    currentStock: number;
    minStock: number;
    unit: string;
  }>;
};

function money(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

export default function RetailStockPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["retail-stock-overview"],
    queryFn: () => fetchJson<RetailDashboardPayload>("/api/v2/retail"),
  });

  const columns = useMemo<ColumnDef<RetailDashboardPayload["lowStock"][number]>[]>(
    () => [
      {
        id: "name",
        header: "Item",
        cell: ({ row }) => (
          <div>
            <div className="font-medium text-[var(--text-strong)]">{row.original.name}</div>
            <div className="font-mono text-xs text-[var(--text-muted)]">{row.original.itemCode}</div>
          </div>
        ),
      },
      {
        id: "currentStock",
        header: "On hand",
        cell: ({ row }) => (
          <NumericCell>{`${row.original.currentStock.toFixed(2)} ${row.original.unit}`}</NumericCell>
        ),
      },
      {
        id: "minStock",
        header: "Reorder",
        cell: ({ row }) => (
          <NumericCell>{`${row.original.minStock.toFixed(2)} ${row.original.unit}`}</NumericCell>
        ),
      },
      {
        id: "gap",
        header: "Gap",
        cell: ({ row }) => (
          <NumericCell>
            {(row.original.minStock - row.original.currentStock).toFixed(2)} {row.original.unit}
          </NumericCell>
        ),
      },
    ],
    [],
  );

  return (
    <RetailShell
      title="Stock"
      actions={
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm">
            <Link href="/retail/purchasing/receipts">
              <ReceiptLong className="h-4 w-4" />
              Receive stock
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/retail/catalog">
              <TableRows className="h-4 w-4" />
              Catalog
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/stores/inventory">
              <Package className="h-4 w-4" />
              Store stock
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/retail/stock/count">
              <Scale className="h-4 w-4" />
              Stock count
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
              <Link href="/retail/stock/transfers">
              <LocalShipping className="h-4 w-4" />
              Transfers
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/retail/reports">
              <BarChart3 className="h-4 w-4" />
              Insights
            </Link>
          </Button>
        </div>
      }
    >
      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-2xl bg-[var(--surface-muted)] px-3 py-3">
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
            Low stock
          </div>
          <div className="mt-2 font-mono text-xl font-semibold text-[var(--text-strong)]">
            {data?.summary.lowStockCount ?? 0}
          </div>
        </div>
        <div className="rounded-2xl bg-[var(--surface-muted)] px-3 py-3">
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
            Goods received
          </div>
          <div className="mt-2 font-mono text-xl font-semibold text-[var(--text-strong)]">
            {money(data?.summary.goodsReceivedValue ?? 0)}
          </div>
        </div>
        <div className="rounded-2xl bg-[var(--surface-muted)] px-3 py-3">
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
            Open orders
          </div>
          <div className="mt-2 font-mono text-xl font-semibold text-[var(--text-strong)]">
            {money(data?.summary.openOrderValue ?? 0)}
          </div>
        </div>
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          Unable to load stock data.
        </div>
      ) : null}

      <DataTable
        data={data?.lowStock ?? []}
        columns={columns}
        features={{ sorting: true, globalFilter: true, pagination: true }}
        pagination={{ enabled: true, server: false }}
        searchPlaceholder="Search low stock items"
        emptyState={isLoading ? "Loading stock..." : "No low-stock items"}
        toolbar={<span className="text-xs text-[var(--text-muted)]">Low-stock watchlist</span>}
      />
    </RetailShell>
  );
}
