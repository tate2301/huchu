"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useQuery } from "@tanstack/react-query";
import { RetailShell } from "@/components/retail/retail-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { NumericCell } from "@/components/ui/numeric-cell";
import { VerticalDataViews } from "@/components/ui/vertical-data-views";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { BarChart3, Package, Payments, ReceiptLong, Wallet } from "@/lib/icons";

type RetailDashboardPayload = {
  summary: {
    grossSales: number;
    netSales: number;
    refundValue: number;
    voidValue: number;
    discountValue: number;
    taxValue: number;
    goodsReceivedValue: number;
    openOrderValue: number;
    activeCatalogCount: number;
    activePromotionCount: number;
    openShiftCount: number;
    lowStockCount: number;
    ticketCount: number;
    averageTicket: number;
    sevenDaySales: number;
  };
  salesTrend: Array<{ id: string; label: string; sales: number; tickets: number }>;
  tenderMix: Array<{ tenderType: string; amount: number }>;
  topItems: Array<{ itemName: string; quantity: number; value: number }>;
  openShifts: Array<{
    id: string;
    shiftNo: string;
    registerName: string;
    cashierName: string;
    openedAt: string;
    expectedCash: number;
  }>;
  lowStock: Array<{
    id: string;
    itemCode: string;
    name: string;
    currentStock: number;
    minStock: number;
    unit: string;
  }>;
  recentSales: Array<{
    id: string;
    saleNo: string;
    saleType: string;
    status: string;
    postedAt: string;
    cashierName: string | null;
    totalAmount: number;
    itemCount: number;
    tenderTypes: string[];
  }>;
};

function money(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function MetricCard({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: string;
  hint: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl bg-[var(--surface-muted)] px-3 py-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
          {label}
        </span>
        <span className="text-[var(--text-muted)]">{icon}</span>
      </div>
      <div className="mt-2 font-mono text-xl font-semibold text-[var(--text-strong)]">{value}</div>
      <div className="mt-1 text-xs text-[var(--text-muted)]">{hint}</div>
    </div>
  );
}

export default function RetailOverviewPage() {
  const [activeView, setActiveView] = useState("sales");
  const { data, isLoading, error } = useQuery({
    queryKey: ["retail-dashboard"],
    queryFn: () => fetchJson<RetailDashboardPayload>("/api/v2/retail"),
  });

  const salesColumns = useMemo<ColumnDef<RetailDashboardPayload["recentSales"][number]>[]>(
    () => [
      {
        id: "saleNo",
        header: "Sale #",
        cell: ({ row }) => (
          <div>
            <div className="font-mono font-semibold">{row.original.saleNo}</div>
            <div className="text-xs text-[var(--text-muted)]">{row.original.saleType}</div>
          </div>
        ),
      },
      {
        id: "postedAt",
        header: "Posted",
        cell: ({ row }) => (
          <NumericCell align="left">
            {new Date(row.original.postedAt).toLocaleDateString()}
          </NumericCell>
        ),
      },
      {
        id: "cashier",
        header: "Cashier",
        cell: ({ row }) => row.original.cashierName ?? "Unassigned",
      },
      {
        id: "items",
        header: "Items",
        cell: ({ row }) => <NumericCell>{row.original.itemCount}</NumericCell>,
      },
      {
        id: "tenders",
        header: "Tender",
        cell: ({ row }) => row.original.tenderTypes.join(", "),
      },
      {
        id: "totalAmount",
        header: "Total",
        cell: ({ row }) => <NumericCell>{money(row.original.totalAmount)}</NumericCell>,
      },
    ],
    [],
  );

  const stockColumns = useMemo<ColumnDef<RetailDashboardPayload["lowStock"][number]>[]>(
    () => [
      {
        id: "itemCode",
        header: "Item",
        cell: ({ row }) => (
          <div>
            <div className="font-medium">{row.original.name}</div>
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
    ],
    [],
  );

  const shiftColumns = useMemo<ColumnDef<RetailDashboardPayload["openShifts"][number]>[]>(
    () => [
      {
        id: "shiftNo",
        header: "Shift",
        cell: ({ row }) => <span className="font-mono font-semibold">{row.original.shiftNo}</span>,
      },
      {
        id: "register",
        header: "Register",
        cell: ({ row }) => row.original.registerName,
      },
      {
        id: "cashier",
        header: "Cashier",
        cell: ({ row }) => row.original.cashierName,
      },
      {
        id: "openedAt",
        header: "Opened",
        cell: ({ row }) => (
          <NumericCell align="left">
            {new Date(row.original.openedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </NumericCell>
        ),
      },
      {
        id: "expectedCash",
        header: "Expected cash",
        cell: ({ row }) => <NumericCell>{money(row.original.expectedCash)}</NumericCell>,
      },
    ],
    [],
  );

  const peakSales = Math.max(...(data?.salesTrend.map((bucket) => bucket.sales) ?? [1]), 1);

  return (
    <RetailShell
      title="Retail"
      description="Run sales, replenishment, pricing, and cash-up from one workspace."
      actions={
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm">
            <Link href="/portal/pos">
              <Payments className="h-4 w-4" />
              Open POS
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/retail/catalog">
              <Package className="h-4 w-4" />
              New Item
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/retail/purchasing/receipts">
              <ReceiptLong className="h-4 w-4" />
              Receive Stock
            </Link>
          </Button>
        </div>
      }
    >
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to load retail overview</AlertTitle>
          <AlertDescription>{getApiErrorMessage(error)}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Sales this month"
          value={money(data?.summary.netSales ?? 0)}
          hint={`${data?.summary.ticketCount ?? 0} tickets · gross ${money(data?.summary.grossSales ?? 0)}`}
          icon={<Wallet className="h-4 w-4" />}
        />
        <MetricCard
          label="Receipts posted"
          value={money(data?.summary.goodsReceivedValue ?? 0)}
          hint={`${money(data?.summary.openOrderValue ?? 0)} still on open orders`}
          icon={<Package className="h-4 w-4" />}
        />
        <MetricCard
          label="Shift activity"
          value={`${data?.summary.openShiftCount ?? 0}`}
          hint={`${money(data?.summary.refundValue ?? 0)} refunds · ${money(data?.summary.voidValue ?? 0)} voids`}
          icon={<Payments className="h-4 w-4" />}
        />
        <MetricCard
          label="Merchandising"
          value={`${data?.summary.activeCatalogCount ?? 0}`}
          hint={`${data?.summary.activePromotionCount ?? 0} active promotions`}
          icon={<BarChart3 className="h-4 w-4" />}
        />
      </div>

      <section className="grid gap-3 xl:grid-cols-[minmax(0,1.35fr)_330px]">
        <div className="rounded-2xl bg-[var(--surface-muted)] px-4 py-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                Seven-day sales
              </div>
              <div className="mt-2 font-mono text-2xl font-semibold text-[var(--text-strong)]">
                {money(data?.summary.sevenDaySales ?? 0)}
              </div>
            </div>
            <div className="text-right text-xs text-[var(--text-muted)]">
              <div>Discounts {money(data?.summary.discountValue ?? 0)}</div>
              <div>Tax {money(data?.summary.taxValue ?? 0)}</div>
              <div>Low stock {data?.summary.lowStockCount ?? 0}</div>
            </div>
          </div>
          <div className="mt-4 grid gap-2 md:grid-cols-7">
            {(data?.salesTrend ?? []).map((bucket) => (
              <div key={bucket.id} className="rounded-2xl bg-[var(--surface-base)] px-3 py-3">
                <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                  {bucket.label}
                </div>
                <div className="mt-3 flex h-16 items-end">
                  <div
                    className="w-8 rounded-full bg-[#d1a45a]"
                    style={{ height: `${Math.max(10, (bucket.sales / peakSales) * 64)}px` }}
                  />
                </div>
                <div className="mt-3 font-mono text-xs text-[var(--text-strong)]">{money(bucket.sales)}</div>
                <div className="text-xs text-[var(--text-muted)]">{bucket.tickets} tickets</div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <div className="rounded-2xl bg-[var(--surface-muted)] px-4 py-4">
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
              Tender mix
            </div>
            <div className="mt-3 space-y-2">
              {(data?.tenderMix ?? []).length === 0 ? (
                <div className="text-sm text-[var(--text-muted)]">No tender data yet.</div>
              ) : (
                (data?.tenderMix ?? []).map((row) => (
                  <div key={row.tenderType} className="flex items-center justify-between gap-3 text-sm">
                    <span>{row.tenderType.replaceAll("_", " ")}</span>
                    <span className="font-mono text-[var(--text-strong)]">{money(row.amount)}</span>
                  </div>
                ))
              )}
            </div>
          </div>
          <div className="rounded-2xl bg-[var(--surface-muted)] px-4 py-4">
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
              Top items
            </div>
            <div className="mt-3 space-y-2">
              {(data?.topItems ?? []).slice(0, 6).map((row) => (
                <div key={row.itemName} className="flex items-center justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{row.itemName}</div>
                    <div className="text-xs text-[var(--text-muted)]">{row.quantity.toFixed(2)} units</div>
                  </div>
                  <span className="font-mono text-[var(--text-strong)]">{money(row.value)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <VerticalDataViews
        value={activeView}
        onValueChange={setActiveView}
        railLabel="Queues"
        items={[
          { id: "sales", label: "Recent sales", count: data?.recentSales.length ?? 0 },
          { id: "stock", label: "Low stock", count: data?.lowStock.length ?? 0 },
          { id: "shifts", label: "Open shifts", count: data?.openShifts.length ?? 0 },
        ]}
      >
        {activeView === "sales" ? (
          <DataTable
            data={data?.recentSales ?? []}
            columns={salesColumns}
            features={{ sorting: true, globalFilter: true, pagination: true }}
            pagination={{ enabled: true, server: false }}
            searchPlaceholder="Search recent sales"
            emptyState={isLoading ? "Loading recent sales..." : "No sales yet"}
            toolbar={<span className="text-xs text-[var(--text-muted)]">Recent posted sales</span>}
          />
        ) : null}

        {activeView === "stock" ? (
          <DataTable
            data={data?.lowStock ?? []}
            columns={stockColumns}
            features={{ sorting: true, globalFilter: true, pagination: true }}
            pagination={{ enabled: true, server: false }}
            searchPlaceholder="Search low-stock items"
            emptyState={isLoading ? "Loading low-stock items..." : "No low-stock items"}
            toolbar={<span className="text-xs text-[var(--text-muted)]">Stock exceptions</span>}
          />
        ) : null}

        {activeView === "shifts" ? (
          <DataTable
            data={data?.openShifts ?? []}
            columns={shiftColumns}
            features={{ sorting: true, globalFilter: true, pagination: true }}
            pagination={{ enabled: true, server: false }}
            searchPlaceholder="Search open shifts"
            emptyState={isLoading ? "Loading shifts..." : "No open shifts"}
            toolbar={<span className="text-xs text-[var(--text-muted)]">Live tills</span>}
          />
        ) : null}
      </VerticalDataViews>
    </RetailShell>
  );
}
