"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { useQuery } from "@tanstack/react-query";
import {
  AdminDistributionChart,
  AdminDonutChart,
  AdminTrendChart,
  AdminDualBarChart,
} from "@/components/charts/admin-headless-charts";
import { RetailShell } from "@/components/retail/retail-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { NumericCell } from "@/components/ui/numeric-cell";
import { VerticalDataViews } from "@/components/ui/vertical-data-views";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { BarChart3, Package, Payments, ReceiptLong } from "@/lib/icons";

type SaleRow = {
  id: string;
  saleNo: string;
  saleType: "SALE" | "REFUND" | "VOID" | string;
  status: string;
  shiftId: string | null;
  siteId: string;
  cashierName: string | null;
  customerName: string | null;
  postedAt: string;
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  totalAmount: number;
  tenderedAmount: number | null;
  changeAmount: number | null;
  promotionCode: string | null;
  overrideReason: string | null;
  voidReason: string | null;
  sourceSaleId: string | null;
  sourceSaleNo: string | null;
  itemCount: number;
  tenderTypes: string[];
  notes: string | null;
};

type SaleDetail = SaleRow & {
  payments: Array<{ id: string; tenderType: string; amount: number; reference: string | null }>;
  lines: Array<{
    id: string;
    sourceLineId: string | null;
    itemName: string;
    quantity: number;
    unitPrice: number;
    discountAmount: number;
    taxAmount: number;
    lineTotal: number;
  }>;
  sourceSale: { id: string; saleNo: string; saleType: string; totalAmount: number } | null;
  reversals: Array<{
    id: string;
    saleNo: string;
    saleType: string;
    status: string;
    totalAmount: number;
    postedAt: string | null;
  }>;
};

function money(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function typeLabel(value: string) {
  return value.replaceAll("_", " ");
}

export default function RetailSalesPage() {
  const [activeView, setActiveView] = useState("posted");
  const [selectedSaleId, setSelectedSaleId] = useState<string | null>(null);

  const salesQuery = useQuery({
    queryKey: ["retail-sales-overview"],
    queryFn: () => fetchJson<{ data: SaleRow[]; summary: Record<string, number> }>("/api/v2/retail/pos/sales?limit=120"),
  });

  const detailQuery = useQuery({
    queryKey: ["retail-sale-detail", selectedSaleId],
    queryFn: () => fetchJson<{ data: SaleDetail }>(`/api/v2/retail/pos/sales/${selectedSaleId}`),
    enabled: Boolean(selectedSaleId),
  });

  const sales = salesQuery.data?.data ?? [];
  const postedSales = sales.filter((sale) => sale.saleType === "SALE");
  const refunds = sales.filter((sale) => sale.saleType === "REFUND");
  const exceptions = sales.filter(
    (sale) => sale.saleType === "VOID" || sale.status === "VOIDED" || Boolean(sale.overrideReason),
  );

  const trendRows = useMemo(() => {
    const buckets = new Map<
      string,
      { label: string; sales: number; refunds: number; voids: number; tickets: number }
    >();

    for (const sale of sales) {
      const day = new Date(sale.postedAt);
      const key = day.toISOString().slice(0, 10);
      const label = day.toLocaleDateString([], { month: "short", day: "numeric" });
      const current = buckets.get(key) ?? { label, sales: 0, refunds: 0, voids: 0, tickets: 0 };
      current.tickets += 1;
      if (sale.saleType === "REFUND") current.refunds += Math.abs(sale.totalAmount);
      else if (sale.saleType === "VOID" || sale.status === "VOIDED") current.voids += Math.abs(sale.totalAmount);
      else current.sales += sale.totalAmount;
      buckets.set(key, current);
    }

    return Array.from(buckets.entries())
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([id, value]) => ({
        id,
        label: value.label,
        sales: value.sales,
        refunds: value.refunds,
        voids: value.voids,
        tickets: value.tickets,
      }));
  }, [sales]);

  const saleMixRows = useMemo(
    () => [
      { id: "sale", label: "Sales", value: postedSales.length, tone: "success" as const },
      { id: "refund", label: "Refunds", value: refunds.length, tone: "warning" as const },
      { id: "void", label: "Voids", value: exceptions.length, tone: "danger" as const },
    ],
    [exceptions.length, postedSales.length, refunds.length],
  );

  const valueRows = useMemo(
    () => [
      {
        id: "sale",
        label: "Sale",
        value: postedSales.reduce((sum, row) => sum + row.totalAmount, 0),
        tone: "success" as const,
      },
      {
        id: "refund",
        label: "Refund",
        value: refunds.reduce((sum, row) => sum + Math.abs(row.totalAmount), 0),
        tone: "warning" as const,
      },
      {
        id: "void",
        label: "Void",
        value: exceptions.reduce((sum, row) => sum + Math.abs(row.totalAmount), 0),
        tone: "danger" as const,
      },
    ],
    [exceptions, postedSales, refunds],
  );

  const topTicketRows = useMemo(
    () =>
      sales
        .slice()
        .sort((left, right) => right.totalAmount - left.totalAmount)
        .slice(0, 6)
        .map((sale) => ({
          id: sale.id,
          label: sale.saleNo,
          primary: sale.totalAmount,
          secondary: sale.itemCount,
        })),
    [sales],
  );

  const columns = useMemo<ColumnDef<SaleRow>[]>(
    () => [
      {
        id: "saleNo",
        header: "Transaction",
        cell: ({ row }) => (
          <button
            type="button"
            className="text-left"
            onClick={() => setSelectedSaleId(row.original.id)}
          >
            <div className="font-mono font-semibold text-[var(--text-strong)]">{row.original.saleNo}</div>
            <div className="text-xs text-[var(--text-muted)]">{typeLabel(row.original.saleType)}</div>
          </button>
        ),
      },
      {
        id: "postedAt",
        header: "Posted",
        cell: ({ row }) => (
          <NumericCell align="left">
            {new Date(row.original.postedAt).toLocaleString([], {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </NumericCell>
        ),
      },
      {
        id: "cashierName",
        header: "Cashier",
        cell: ({ row }) => row.original.cashierName ?? "-",
      },
      {
        id: "customerName",
        header: "Customer",
        cell: ({ row }) => row.original.customerName ?? "Walk-in",
      },
      {
        id: "itemCount",
        header: "Items",
        cell: ({ row }) => <NumericCell>{row.original.itemCount}</NumericCell>,
      },
      {
        id: "tenderTypes",
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

  return (
    <RetailShell
      title="Sales"
      actions={
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm">
            <Link href="/portal/pos">
              <Payments className="h-4 w-4" />
              Open POS
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/retail/shifts">
              <ReceiptLong className="h-4 w-4" />
              Shifts & Cash-up
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/retail/catalog">
              <Package className="h-4 w-4" />
              Catalog
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/retail/reports">
              <BarChart3 className="h-4 w-4" />
              Reports
            </Link>
          </Button>
        </div>
      }
    >
      {salesQuery.error ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to load retail sales</AlertTitle>
          <AlertDescription>{getApiErrorMessage(salesQuery.error)}</AlertDescription>
        </Alert>
      ) : null}

      <section className="rounded-[28px] border border-[var(--edge-subtle)] bg-[var(--surface-base)] p-5 shadow-[var(--shadow-card)]">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.18em] text-[var(--text-muted)]">Sales at a glance</p>
            <h2 className="mt-1 text-2xl font-semibold text-[var(--text-strong)]">
              Gross, refunds, voids, and net movement
            </h2>
          </div>
          <div className="rounded-2xl bg-[var(--surface-subtle)] px-4 py-3 text-right">
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-muted)]">Net sales</p>
            <p className="font-mono text-3xl font-semibold text-[var(--text-strong)]">
              {money(salesQuery.data?.summary.netSales ?? 0)}
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.85fr)]">
          <AdminTrendChart
            rows={trendRows}
            series={[
              { key: "sales", label: "Sales", kind: "area", tone: "success", fillOpacity: 0.12 },
              { key: "refunds", label: "Refunds", kind: "line", tone: "warning", dashed: true },
              { key: "voids", label: "Voids", kind: "line", tone: "danger", dashed: true },
            ]}
            comparisonSeries={[
              { key: "tickets", label: "Tickets", kind: "line", tone: "default", hiddenByDefault: true },
            ]}
            height={300}
            valueFormatter={money}
            yTickFormatter={money}
            emptyLabel="Sales trend is loading"
          />
          <AdminDonutChart
            rows={saleMixRows}
            valueLabel="Transactions"
            valueFormatter={(value) => value.toString()}
            height={300}
            emptyLabel="Sale mix is loading"
          />
        </div>
      </section>

      <section className="rounded-[28px] border border-[var(--edge-subtle)] bg-[var(--surface-base)] p-5 shadow-[var(--shadow-card)]">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.18em] text-[var(--text-muted)]">Ticket concentration</p>
            <h3 className="mt-1 text-xl font-semibold text-[var(--text-strong)]">Largest tickets in the current view</h3>
          </div>
          <div className="rounded-2xl bg-[var(--surface-subtle)] px-4 py-3 text-right">
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-muted)]">Gross sales</p>
            <p className="font-mono text-2xl font-semibold text-[var(--text-strong)]">
              {money(salesQuery.data?.summary.grossSales ?? 0)}
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.75fr)]">
          <AdminDualBarChart
            rows={topTicketRows}
            primaryLabel="Amount"
            secondaryLabel="Items"
            height={280}
            valueFormatter={(value) => value.toFixed(0)}
            emptyLabel="Top sales are loading"
          />
          <AdminDistributionChart
            rows={valueRows}
            valueLabel="Value"
            valueFormatter={money}
            height={280}
            emptyLabel="Type totals are loading"
          />
        </div>
      </section>

      <VerticalDataViews
        value={activeView}
        onValueChange={setActiveView}
        railLabel="Queues"
        items={[
          { id: "posted", label: "Posted sales", count: postedSales.length },
          { id: "refunds", label: "Refunds", count: refunds.length },
          { id: "exceptions", label: "Exceptions", count: exceptions.length },
        ]}
      >
        {activeView === "posted" ? (
          <DataTable
            data={postedSales}
            columns={columns}
            features={{ sorting: true, globalFilter: true, pagination: true }}
            pagination={{ enabled: true, server: false }}
            searchPlaceholder="Search posted sales"
            emptyState={salesQuery.isLoading ? "Loading sales..." : "No posted sales yet"}
            toolbar={<span className="text-xs text-[var(--text-muted)]">Posted checkout activity</span>}
          />
        ) : null}

        {activeView === "refunds" ? (
          <DataTable
            data={refunds}
            columns={columns}
            features={{ sorting: true, globalFilter: true, pagination: true }}
            pagination={{ enabled: true, server: false }}
            searchPlaceholder="Search refunds"
            emptyState={salesQuery.isLoading ? "Loading refunds..." : "No refunds yet"}
            toolbar={<span className="text-xs text-[var(--text-muted)]">Refund and return activity</span>}
          />
        ) : null}

        {activeView === "exceptions" ? (
          <DataTable
            data={exceptions}
            columns={columns}
            features={{ sorting: true, globalFilter: true, pagination: true }}
            pagination={{ enabled: true, server: false }}
            searchPlaceholder="Search exceptions"
            emptyState={salesQuery.isLoading ? "Loading exceptions..." : "No exceptions yet"}
            toolbar={<span className="text-xs text-[var(--text-muted)]">Voids and overridden checkouts</span>}
          />
        ) : null}
      </VerticalDataViews>

      <Dialog open={Boolean(selectedSaleId)} onOpenChange={(open) => !open && setSelectedSaleId(null)}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{detailQuery.data?.data.saleNo ?? "Transaction detail"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-4">
              <div className="rounded-2xl bg-[var(--surface-muted)] px-3 py-3">
                <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                  Type
                </div>
                <div className="mt-2 text-sm font-medium">{typeLabel(detailQuery.data?.data.saleType ?? "-")}</div>
              </div>
              <div className="rounded-2xl bg-[var(--surface-muted)] px-3 py-3">
                <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                  Total
                </div>
                <div className="mt-2 font-mono text-sm font-semibold">
                  {money(detailQuery.data?.data.totalAmount ?? 0)}
                </div>
              </div>
              <div className="rounded-2xl bg-[var(--surface-muted)] px-3 py-3">
                <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                  Promotion
                </div>
                <div className="mt-2 text-sm font-medium">{detailQuery.data?.data.promotionCode ?? "-"}</div>
              </div>
              <div className="rounded-2xl bg-[var(--surface-muted)] px-3 py-3">
                <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                  Source
                </div>
                <div className="mt-2 text-sm font-medium">{detailQuery.data?.data.sourceSale?.saleNo ?? "-"}</div>
              </div>
            </div>

            {detailQuery.data?.data.overrideReason || detailQuery.data?.data.voidReason || detailQuery.data?.data.notes ? (
              <div className="rounded-2xl bg-[var(--surface-muted)] px-3 py-3 text-sm text-[var(--text-muted)]">
                {detailQuery.data?.data.overrideReason ? <div>Override: {detailQuery.data.data.overrideReason}</div> : null}
                {detailQuery.data?.data.voidReason ? <div>Void: {detailQuery.data.data.voidReason}</div> : null}
                {detailQuery.data?.data.notes ? <div>Notes: {detailQuery.data.data.notes}</div> : null}
              </div>
            ) : null}

            <div className="rounded-2xl bg-[var(--surface-muted)] px-3 py-3">
              <div className="text-sm font-medium">Lines</div>
              <div className="mt-3 space-y-2">
                {(detailQuery.data?.data.lines ?? []).map((line) => (
                  <div key={line.id} className="flex items-center justify-between gap-3 rounded-2xl bg-[var(--surface-base)] px-3 py-3 text-sm">
                    <div>
                      <div className="font-medium">{line.itemName}</div>
                      <div className="text-xs text-[var(--text-muted)]">
                        {line.quantity.toFixed(2)} x {money(line.unitPrice)}
                      </div>
                    </div>
                    <NumericCell>{money(line.lineTotal)}</NumericCell>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl bg-[var(--surface-muted)] px-3 py-3">
              <div className="text-sm font-medium">Payments</div>
              <div className="mt-3 space-y-2">
                {(detailQuery.data?.data.payments ?? []).map((payment) => (
                  <div key={payment.id} className="flex items-center justify-between gap-3 rounded-2xl bg-[var(--surface-base)] px-3 py-3 text-sm">
                    <div>
                      <div className="font-medium">{typeLabel(payment.tenderType)}</div>
                      <div className="text-xs text-[var(--text-muted)]">{payment.reference ?? "No reference"}</div>
                    </div>
                    <NumericCell>{money(payment.amount)}</NumericCell>
                  </div>
                ))}
              </div>
            </div>

            {(detailQuery.data?.data.reversals ?? []).length > 0 ? (
              <div className="rounded-2xl bg-[var(--surface-muted)] px-3 py-3">
                <div className="text-sm font-medium">Reversals</div>
                <div className="mt-3 space-y-2">
                  {detailQuery.data?.data.reversals.map((reversal) => (
                    <div key={reversal.id} className="flex items-center justify-between gap-3 rounded-2xl bg-[var(--surface-base)] px-3 py-3 text-sm">
                      <div>
                        <div className="font-medium">{reversal.saleNo}</div>
                        <div className="text-xs text-[var(--text-muted)]">{typeLabel(reversal.saleType)}</div>
                      </div>
                      <NumericCell>{money(reversal.totalAmount)}</NumericCell>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </RetailShell>
  );
}
