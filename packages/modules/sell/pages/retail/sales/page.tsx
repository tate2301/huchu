"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import {
  AdminDistributionChart,
  AdminDonutChart,
  AdminTrendChart,
  AdminDualBarChart,
} from "@corelithzw/ui/charts/admin-headless-charts";
import { Alert, Card, EmptyState, Skeleton, StatCard } from "@corelithzw/react";
import { RetailShell } from "../../../components/retail-shell";
import { RetailSaleDetailBody } from "../../../components/sale-detail";
import { Button } from "@corelithzw/ui/components/button";
import { DataTable } from "@corelithzw/ui/components/data-table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@corelithzw/ui/components/dialog";
import { NumericCell } from "@corelithzw/ui/components/numeric-cell";
import { VerticalDataViews } from "@corelithzw/ui/components/vertical-data-views";
import { fetchJson, getApiErrorMessage } from "@corelithzw/platform/api-client";
import { BarChart3, Package, Payments, ReceiptLong } from "@corelithzw/ui/lib/icons";
import { canAccessPosPortal } from "../../../pos-host";

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
  const { data: session } = useSession();
  const canOpenPos = canAccessPosPortal(session?.user?.role);
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

  const sales = useMemo(() => salesQuery.data?.data ?? [], [salesQuery.data]);
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
          <div className="text-left">
            {/* The receipt number links; the type below it opens the dialog. */}
            <Link
              href={`/retail/sales/${row.original.id}`}
              className="font-mono font-semibold text-[var(--text-strong)] underline-offset-2 hover:underline"
            >
              {row.original.saleNo}
            </Link>
            <button
              type="button"
              className="block text-xs text-[var(--text-muted)] underline-offset-2 hover:underline"
              onClick={() => setSelectedSaleId(row.original.id)}
            >
              {typeLabel(row.original.saleType)}
            </button>
          </div>
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

  const actions = (
    <div className="flex flex-wrap gap-2">
      {canOpenPos ? (
        <Button asChild size="sm">
          <Link href="/portal/pos">
            <Payments className="h-4 w-4" />
            Open POS
          </Link>
        </Button>
      ) : (
        <Button asChild size="sm" variant="outline">
          <Link href="/retail/shifts">
            <ReceiptLong className="h-4 w-4" />
            Shifts & Cash-up
          </Link>
        </Button>
      )}
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
  );

  if (salesQuery.isPending) {
    return (
      <RetailShell title="Sales" actions={actions}>
        <div aria-busy="true" aria-live="polite" className="space-y-4">
          <span className="sr-only">Fetching posted sales…</span>
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

  if (salesQuery.isError) {
    return (
      <RetailShell title="Sales" actions={actions}>
        <Alert tone="danger" title="Retail sales would not load">
          {getApiErrorMessage(salesQuery.error)}
        </Alert>
      </RetailShell>
    );
  }

  if (sales.length === 0) {
    return (
      <RetailShell title="Sales" actions={actions}>
        <EmptyState
          title="No sales posted yet"
          body="Every ticket the till rings up lands here, with its refunds and voids alongside it."
          action={
            canOpenPos ? (
              <Button asChild size="sm">
                <Link href="/portal/pos">Open the till</Link>
              </Button>
            ) : undefined
          }
        />
      </RetailShell>
    );
  }

  return (
    <RetailShell title="Sales" actions={actions}>
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Net sales"
          value={money(salesQuery.data.summary.netSales ?? 0)}
          footer="After refunds and voids"
        />
        <StatCard
          label="Gross sales"
          value={money(salesQuery.data.summary.grossSales ?? 0)}
          footer={`${postedSales.length} posted ticket${postedSales.length === 1 ? "" : "s"}`}
        />
        <StatCard
          label="Exceptions"
          value={String(refunds.length + exceptions.length)}
          tone={refunds.length + exceptions.length > 0 ? "warn" : "neutral"}
          footer={`${refunds.length} refund${refunds.length === 1 ? "" : "s"}, ${exceptions.length} void${exceptions.length === 1 ? "" : "s"}`}
        />
      </div>

      <Card title="Gross, refunds, voids and net movement">
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.85fr)]">
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
            emptyLabel="No sales in this window."
          />
          <AdminDonutChart
            rows={saleMixRows}
            valueLabel="Transactions"
            valueFormatter={(value) => value.toString()}
            height={300}
            emptyLabel="No sale mix to show."
          />
        </div>
      </Card>

      <Card title="Largest tickets in the current view">
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.75fr)]">
          <AdminDualBarChart
            rows={topTicketRows}
            primaryLabel="Amount"
            secondaryLabel="Items"
            height={280}
            valueFormatter={(value) => value.toFixed(0)}
            emptyLabel="No tickets to rank."
          />
          <AdminDistributionChart
            rows={valueRows}
            valueLabel="Value"
            valueFormatter={money}
            height={280}
            emptyLabel="No type totals to show."
          />
        </div>
      </Card>

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
            emptyState="No posted sales match that search."
          />
        ) : null}

        {activeView === "refunds" ? (
          <DataTable
            data={refunds}
            columns={columns}
            features={{ sorting: true, globalFilter: true, pagination: true }}
            pagination={{ enabled: true, server: false }}
            searchPlaceholder="Search refunds"
            emptyState="No refunds in this window."
          />
        ) : null}

        {activeView === "exceptions" ? (
          <DataTable
            data={exceptions}
            columns={columns}
            features={{ sorting: true, globalFilter: true, pagination: true }}
            pagination={{ enabled: true, server: false }}
            searchPlaceholder="Search exceptions"
            emptyState="No voids or overrides in this window."
          />
        ) : null}
      </VerticalDataViews>

      <Dialog open={Boolean(selectedSaleId)} onOpenChange={(open) => !open && setSelectedSaleId(null)}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{detailQuery.data?.data.saleNo ?? "Transaction detail"}</DialogTitle>
          </DialogHeader>
          {detailQuery.isPending ? (
            <div aria-busy="true" className="space-y-3">
              <Skeleton height={88} />
              <Skeleton height={160} />
            </div>
          ) : detailQuery.isError ? (
            <Alert tone="danger" title="That transaction would not open">
              {getApiErrorMessage(detailQuery.error)}
            </Alert>
          ) : (
            /*
              R-4.3. The same body `/retail/sales/{id}` renders.

              It was 90 lines of markup here and would have been 90 more on the
              page. A receipt shown two ways that could disagree about what was
              sold is worse than a receipt shown one way, so it moved to
              `components/retail/sale-detail.tsx` and both call it.

              `onOpenSale` swaps which sale the dialog shows rather than
              navigating, because the person using it is scanning a list and
              should not lose their place to follow a reversal.
            */
            <RetailSaleDetailBody
              sale={detailQuery.data.data}
              onOpenSale={setSelectedSaleId}
            />
          )}
        </DialogContent>
      </Dialog>
    </RetailShell>
  );
}
