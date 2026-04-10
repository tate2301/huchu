"use client";

import Link from "next/link";
import { useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useQuery } from "@tanstack/react-query";
import {
  AdminDistributionChart,
  AdminDualBarChart,
  AdminDonutChart,
} from "@/components/charts/admin-headless-charts";
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

  const stockRows = useMemo(
    () =>
      (data?.lowStock ?? []).slice(0, 8).map((item) => ({
        id: item.id,
        label: item.name,
        primary: item.currentStock,
        secondary: item.minStock,
      })),
    [data?.lowStock],
  );

  const gapRows = useMemo(
    () =>
      (data?.lowStock ?? [])
        .slice()
        .sort((left, right) => (right.minStock - right.currentStock) - (left.minStock - left.currentStock))
        .slice(0, 8)
        .map((item) => ({
          id: item.id,
          label: item.itemCode,
          value: Math.max(item.minStock - item.currentStock, 0),
          tone: (item.minStock - item.currentStock) > 0 ? ("warning" as const) : ("success" as const),
        })),
    [data?.lowStock],
  );

  const stockHealthRows = useMemo(
    () => [
      { id: "critical", label: "Critical", value: data?.lowStock.filter((item) => item.currentStock <= 0).length ?? 0, tone: "danger" as const },
      {
        id: "low",
        label: "Low",
        value: data?.lowStock.filter((item) => item.currentStock > 0 && item.currentStock < item.minStock).length ?? 0,
        tone: "warning" as const,
      },
      {
        id: "safe",
        label: "Safe",
        value: data?.lowStock.filter((item) => item.currentStock >= item.minStock).length ?? 0,
        tone: "success" as const,
      },
    ],
    [data?.lowStock],
  );

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
      <section className="rounded-[28px] border border-[var(--edge-subtle)] bg-[var(--surface-base)] p-5 shadow-[var(--shadow-card)]">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.18em] text-[var(--text-muted)]">Stock signal</p>
            <h2 className="mt-1 text-2xl font-semibold text-[var(--text-strong)]">Availability, reorder pressure, and gap depth</h2>
          </div>
          <div className="rounded-2xl bg-[var(--surface-subtle)] px-4 py-3 text-right">
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-muted)]">Low stock items</p>
            <p className="font-mono text-3xl font-semibold text-[var(--text-strong)]">
              {data?.summary.lowStockCount ?? 0}
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.85fr)]">
          <AdminDualBarChart
            rows={stockRows}
            primaryLabel="On hand"
            secondaryLabel="Reorder"
            height={300}
            valueFormatter={(value) => value.toFixed(2)}
            emptyLabel="Stock coverage is loading"
          />
          <AdminDonutChart
            rows={stockHealthRows}
            valueLabel="Items"
            valueFormatter={(value) => value.toString()}
            height={300}
            emptyLabel="Stock health is loading"
          />
        </div>
      </section>

      <section className="rounded-[28px] border border-[var(--edge-subtle)] bg-[var(--surface-base)] p-5 shadow-[var(--shadow-card)]">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.18em] text-[var(--text-muted)]">Gap pressure</p>
            <h3 className="mt-1 text-xl font-semibold text-[var(--text-strong)]">Largest reorder gaps in the current watchlist</h3>
          </div>
          <div className="rounded-2xl bg-[var(--surface-subtle)] px-4 py-3 text-right">
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-muted)]">Open orders</p>
            <p className="font-mono text-2xl font-semibold text-[var(--text-strong)]">
              {money(data?.summary.openOrderValue ?? 0)}
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.75fr)]">
          <AdminDistributionChart
            rows={gapRows}
            valueLabel="Gap"
            valueFormatter={(value) => value.toFixed(2)}
            height={280}
            emptyLabel="Reorder gaps are loading"
          />
          <div className="rounded-[24px] border border-[var(--edge-subtle)] bg-[var(--surface-subtle)] p-4">
            <p className="text-xs uppercase tracking-[0.16em] text-[var(--text-muted)]">Goods received</p>
            <p className="mt-2 font-mono text-3xl font-semibold text-[var(--text-strong)]">
              {money(data?.summary.goodsReceivedValue ?? 0)}
            </p>
            <p className="mt-2 text-sm text-[var(--text-muted)]">
              Stock movement is still listed below, but the chart now carries the visual signal up front.
            </p>
          </div>
        </div>
      </section>

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
