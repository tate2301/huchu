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
import { Alert, Card, EmptyState, Skeleton, StatCard } from "@corelithzw/react";
import { RetailShell } from "@/components/retail/retail-shell";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { NumericCell } from "@/components/ui/numeric-cell";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import {
  ArrowDownward,
  BarChart3,
  ChevronDown,
  ClipboardList,
  Grid3x3,
  LocalShipping,
  Package,
  ReceiptLong,
  Scale,
  TableRows,
} from "@/lib/icons";
import {
  MobileListCard,
  MobileListCardHeader,
  MobileListMetricStrip,
} from "@/components/ui/mobile-list-card";

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
  const { data, isPending, isError, error } = useQuery({
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

  const actions = (
    <div className="flex flex-wrap gap-2">
      <Button asChild size="sm">
        <Link href="/retail/purchasing/receipts">
          <ReceiptLong className="h-4 w-4" />
          Receive stock
        </Link>
      </Button>
      <Button asChild size="sm" variant="outline">
        <Link href="/retail/stock/count">
          <Scale className="h-4 w-4" />
          Stock count
        </Link>
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="outline" className="gap-1">
            <Grid3x3 className="h-4 w-4" />
            <span className="hidden sm:inline">More</span>
            <ChevronDown className="h-3 w-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <Link href="/retail/catalog" className="flex items-center gap-2">
              <TableRows className="h-4 w-4" /> Catalog
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/stores/inventory" className="flex items-center gap-2">
              <Package className="h-4 w-4" /> Store stock
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/retail/stock/transfers" className="flex items-center gap-2">
              <LocalShipping className="h-4 w-4" /> Transfers
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/retail/reports" className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" /> Insights
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );

  if (isPending) {
    return (
      <RetailShell title="Stock" actions={actions}>
        <div aria-busy="true" aria-live="polite" className="space-y-4">
          <span className="sr-only">Reading the stock watchlist…</span>
          <div className="grid gap-4 sm:grid-cols-3">
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

  if (isError) {
    return (
      <RetailShell title="Stock" actions={actions}>
        <Alert tone="danger" title="Stock would not load">
          {getApiErrorMessage(error)}
        </Alert>
      </RetailShell>
    );
  }

  return (
    <RetailShell title="Stock" actions={actions}>
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="On the watchlist"
          value={String(data.summary.lowStockCount)}
          tone={data.summary.lowStockCount > 0 ? "warn" : "success"}
          footer="Lines at or under reorder"
        />
        <StatCard
          label="On order"
          value={money(data.summary.openOrderValue)}
          footer="Placed, not yet received"
        />
        <StatCard
          label="Received"
          value={money(data.summary.goodsReceivedValue)}
          footer="Goods booked in this period"
        />
      </div>

      {data.lowStock.length === 0 ? (
        <EmptyState
          title="Nothing is running low"
          body="Lines appear on this watchlist as soon as they fall to their reorder point, so you can order before the weekend."
          action={
            <Button asChild size="sm">
              <Link href="/retail/purchasing/receipts">Receive stock</Link>
            </Button>
          }
        />
      ) : (
        <>
          <Card title="Availability, reorder pressure and gap depth">
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.85fr)]">
              <AdminDualBarChart
                rows={stockRows}
                primaryLabel="On hand"
                secondaryLabel="Reorder"
                height={300}
                valueFormatter={(value) => value.toFixed(2)}
                emptyLabel="No stock coverage to show."
              />
              <AdminDonutChart
                rows={stockHealthRows}
                valueLabel="Items"
                valueFormatter={(value) => value.toString()}
                height={300}
                emptyLabel="No stock health to show."
              />
            </div>
          </Card>

          <Card title="Largest reorder gaps in the current watchlist">
            <AdminDistributionChart
              rows={gapRows}
              valueLabel="Gap"
              valueFormatter={(value) => value.toFixed(2)}
              height={280}
              emptyLabel="No reorder gaps to show."
            />
          </Card>

          <DataTable
            data={data.lowStock}
            columns={columns}
            features={{ sorting: true, globalFilter: true, pagination: true }}
            pagination={{ enabled: true, server: false }}
            searchPlaceholder="Search low stock items"
            emptyState="No low-stock lines match that search."
            toolbar={<span className="t-body-sm t-muted">Low-stock watchlist</span>}
            /*
              R-4.5. Below `md`, the row becomes a card.

              Retail had none of these — twelve tables, zero
              `mobileCardRenderer`, while ten scrap-metal screens had used the
              pattern for months. A shopkeeper checking stock is doing it on a
              phone in the storeroom, which is the one place a horizontally
              scrolling eight-column table is worst.
            */
            mobileCardRenderer={({ row }) => (
              <MobileListCard>
                <MobileListCardHeader title={row.name} subtitle={row.itemCode} />
                <MobileListMetricStrip
                  items={[
                    {
                      icon: Package,
                      value: `${row.currentStock.toFixed(2)} ${row.unit}`,
                      srLabel: "On hand",
                    },
                    {
                      icon: ArrowDownward,
                      value: `${row.minStock.toFixed(2)} ${row.unit}`,
                      srLabel: "Reorder point",
                    },
                    {
                      // The figure the storeroom is actually reading: how many
                      // to order to get back above the minimum.
                      icon: ClipboardList,
                      value: `${(row.minStock - row.currentStock).toFixed(2)} ${row.unit} short`,
                      srLabel: "Gap to the reorder point",
                    },
                  ]}
                />
              </MobileListCard>
            )}
          />
        </>
      )}
    </RetailShell>
  );
}
