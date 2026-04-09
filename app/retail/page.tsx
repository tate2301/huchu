"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AdminDonutChart,
  AdminTrendChart,
  AdminWaterfallChart,
  type DistributionRow,
  type TrendChartRow,
  type WaterfallRow,
} from "@/components/charts/admin-headless-charts";
import { RetailShell } from "@/components/retail/retail-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import {
  BarChart3,
  Building2,
  CheckCircle2,
  ClipboardList,
  LocalShipping,
  Package,
  Payments,
  ReceiptLong,
  TrendingDown,
  TrendingUp,
  Users,
  Wallet,
} from "@/lib/icons";

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
  ownerMetrics: {
    model: "ACCOUNTING_POSTED" | "ESTIMATED_FROM_OPERATIONS";
    period: { start: string; end: string };
    previousPeriod: { start: string; end: string };
    kpis: {
      grossProfit: number;
      grossMarginPct: number;
      ebitda: number;
      ebitdaMarginPct: number;
      netProfit: number;
      netMarginPct: number;
      monthlyRunRateRevenue: number;
      inventoryPressurePct: number;
    };
    momentum: {
      revenueDeltaPct: number;
      grossProfitDeltaPct: number;
      ebitdaDeltaPct: number;
      netProfitDeltaPct: number;
    };
    highlights: Array<{
      id: string;
      title: string;
      value: number | string;
      deltaPct: number;
      detail: string;
      tone: "default" | "success" | "warning" | "danger";
    }>;
    trend: Array<{
      id: string;
      label: string;
      netRevenue: number;
      grossProfit: number;
      ebitda: number;
      netProfit: number;
      averageTicket: number;
      previousNetRevenue: number;
      previousGrossProfit: number;
      previousEbitda: number;
      previousNetProfit: number;
      previousAverageTicket: number;
    }>;
    costBridge: {
      revenue: number;
      cogs: number;
      operatingExpense: number;
      ebitda: number;
      netProfit: number;
    };
  };
  tenderMix: Array<{ tenderType: string; amount: number }>;
  topItems: Array<{ itemName: string; quantity: number; value: number }>;
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
  }).format(value || 0);
}

function pct(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function DeltaPill({ value }: { value: number }) {
  const positive = value >= 0;
  return (
    <span
      className={
        positive
          ? "inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700"
          : "inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-700"
      }
    >
      {positive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {pct(value)}
    </span>
  );
}

function KpiCard({
  title,
  value,
  detail,
  deltaPct,
}: {
  title: string;
  value: string;
  detail: string;
  deltaPct: number;
}) {
  return (
    <div className="rounded-2xl border border-[var(--edge-subtle)] bg-[var(--surface-base)] px-4 py-4">
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
        {title}
      </div>
      <div className="mt-2 font-mono text-[1.9rem] font-semibold leading-none text-[var(--text-strong)]">
        {value}
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        <div className="text-xs text-[var(--text-muted)]">{detail}</div>
        <DeltaPill value={deltaPct} />
      </div>
    </div>
  );
}

function SectionCard({
  title,
  metricLabel,
  metricValue,
  children,
}: {
  title: string;
  metricLabel: string;
  metricValue: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-[var(--edge-subtle)] bg-[var(--surface-base)] px-4 py-4">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--edge-subtle)] pb-3">
        <div>
          <h3 className="text-xl font-semibold text-[var(--text-strong)]">{title}</h3>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            Date range <span className="font-semibold text-[var(--text-strong)]">Last 12 months</span> ·
            Compare <span className="font-semibold text-[var(--text-strong)]">Previous period</span>
          </p>
        </div>
        <div className="text-right">
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
            {metricLabel}
          </div>
          <div className="mt-1 font-mono text-xl font-semibold text-[var(--text-strong)]">{metricValue}</div>
        </div>
      </div>
      <div className="pt-4">{children}</div>
    </section>
  );
}

export default function RetailOverviewPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["retail-dashboard-owner-overview"],
    queryFn: () => fetchJson<RetailDashboardPayload>("/api/v2/retail"),
  });

  const trendRows = useMemo<TrendChartRow[]>(
    () =>
      (data?.ownerMetrics.trend ?? []).map((row) => ({
        label: row.label,
        netRevenue: row.netRevenue,
        grossProfit: row.grossProfit,
        ebitda: row.ebitda,
        netProfit: row.netProfit,
        averageTicket: row.averageTicket,
        previousNetRevenue: row.previousNetRevenue,
        previousGrossProfit: row.previousGrossProfit,
        previousEbitda: row.previousEbitda,
        previousNetProfit: row.previousNetProfit,
        previousAverageTicket: row.previousAverageTicket,
      })),
    [data?.ownerMetrics.trend],
  );

  const tenderRows = useMemo<DistributionRow[]>(
    () =>
      (data?.tenderMix ?? []).map((row) => ({
        id: row.tenderType,
        label: row.tenderType.replaceAll("_", " "),
        value: row.amount,
      })),
    [data?.tenderMix],
  );

  const bridgeRows = useMemo<WaterfallRow[]>(
    () => [
      {
        id: "revenue",
        label: "Revenue",
        value: data?.ownerMetrics.costBridge.revenue ?? 0,
        tone: "success",
      },
      {
        id: "cogs",
        label: "COGS",
        value: -(data?.ownerMetrics.costBridge.cogs ?? 0),
        tone: "warning",
      },
      {
        id: "opex",
        label: "OpEx",
        value: -(data?.ownerMetrics.costBridge.operatingExpense ?? 0),
        tone: "warning",
      },
      {
        id: "ebitda",
        label: "EBITDA",
        value: data?.ownerMetrics.costBridge.ebitda ?? 0,
        tone: "default",
      },
      {
        id: "net",
        label: "Net",
        value: data?.ownerMetrics.costBridge.netProfit ?? 0,
        tone: data && data.ownerMetrics.costBridge.netProfit >= 0 ? "success" : "danger",
      },
    ],
    [data],
  );

  return (
    <RetailShell
      title="Business overview"
      actions={
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm">
            <Link href="/portal/pos">
              <Payments className="h-4 w-4" />
              Open POS
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/retail/insights">
              <BarChart3 className="h-4 w-4" />
              Detailed insights
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/retail/accounting">
              <ReceiptLong className="h-4 w-4" />
              Accounting
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/retail/stock">
              <Package className="h-4 w-4" />
              Stock
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/retail/buy">
              <LocalShipping className="h-4 w-4" />
              Buy
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/retail/customers">
              <Users className="h-4 w-4" />
              Customers
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/retail/setup">
              <Building2 className="h-4 w-4" />
              Setup
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/retail/sell">
              <ClipboardList className="h-4 w-4" />
              Sell
            </Link>
          </Button>
        </div>
      }
    >
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to load retail business overview</AlertTitle>
          <AlertDescription>{getApiErrorMessage(error)}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_330px]">
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <KpiCard
              title="Gross profit"
              value={money(data?.ownerMetrics.kpis.grossProfit ?? 0)}
              detail={`Margin ${((data?.ownerMetrics.kpis.grossMarginPct ?? 0) || 0).toFixed(1)}%`}
              deltaPct={data?.ownerMetrics.momentum.grossProfitDeltaPct ?? 0}
            />
            <KpiCard
              title="EBITDA"
              value={money(data?.ownerMetrics.kpis.ebitda ?? 0)}
              detail={`Margin ${((data?.ownerMetrics.kpis.ebitdaMarginPct ?? 0) || 0).toFixed(1)}%`}
              deltaPct={data?.ownerMetrics.momentum.ebitdaDeltaPct ?? 0}
            />
            <KpiCard
              title="Net profit"
              value={money(data?.ownerMetrics.kpis.netProfit ?? 0)}
              detail={`Margin ${((data?.ownerMetrics.kpis.netMarginPct ?? 0) || 0).toFixed(1)}%`}
              deltaPct={data?.ownerMetrics.momentum.netProfitDeltaPct ?? 0}
            />
          </div>

          <SectionCard
            title="Volume"
            metricLabel="Revenue run-rate"
            metricValue={money(data?.ownerMetrics.kpis.monthlyRunRateRevenue ?? 0)}
          >
            <AdminTrendChart
              rows={trendRows}
              series={[
                {
                  key: "netRevenue",
                  label: "Net revenue",
                  color: "var(--primary-500)",
                  kind: "line",
                },
              ]}
              comparisonSeries={[
                {
                  key: "previousNetRevenue",
                  label: "Previous period",
                  color: "var(--text-muted)",
                  kind: "line",
                  dashed: true,
                },
              ]}
              emptyLabel={isLoading ? "Loading revenue trend..." : "No revenue trend available."}
              valueFormatter={money}
              yTickFormatter={money}
              xTickInterval={0}
              height={260}
            />
          </SectionCard>

          <section className="grid gap-4 xl:grid-cols-2">
            <SectionCard
              title="Performance"
              metricLabel="Gross margin"
              metricValue={`${(data?.ownerMetrics.kpis.grossMarginPct ?? 0).toFixed(1)}%`}
            >
              <AdminTrendChart
                rows={trendRows}
                series={[
                  { key: "grossProfit", label: "Gross profit", color: "var(--success-500)" },
                  { key: "ebitda", label: "EBITDA", color: "var(--primary-500)" },
                  { key: "netProfit", label: "Net profit", color: "var(--accent-500)" },
                ]}
                comparisonSeries={[
                  {
                    key: "previousNetProfit",
                    label: "Prev net profit",
                    color: "var(--text-muted)",
                    kind: "line",
                    dashed: true,
                  },
                ]}
                emptyLabel={isLoading ? "Loading profitability trend..." : "No profitability trend."}
                valueFormatter={money}
                yTickFormatter={money}
                xTickInterval={0}
                height={250}
              />
            </SectionCard>

            <SectionCard
              title="Profit bridge"
              metricLabel="Current net profit"
              metricValue={money(data?.ownerMetrics.costBridge.netProfit ?? 0)}
            >
              <AdminWaterfallChart
                rows={bridgeRows}
                emptyLabel={isLoading ? "Loading bridge..." : "No bridge data available."}
                valueFormatter={money}
                yTickFormatter={money}
                height={250}
              />
            </SectionCard>
          </section>
        </div>

        <aside className="space-y-4">
          <section className="rounded-2xl border border-[var(--edge-subtle)] bg-[var(--surface-base)] px-4 py-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-xl font-semibold text-[var(--text-strong)]">Priorities</h3>
                <p className="mt-1 text-xs text-[var(--text-muted)]">Owner-level operating focus</p>
              </div>
              <span className="rounded-full bg-[var(--surface-muted)] px-2 py-1 text-xs font-semibold">
                {(data?.ownerMetrics.highlights?.length ?? 0).toString()}
              </span>
            </div>
            <div className="mt-3 space-y-2">
              {(data?.ownerMetrics.highlights ?? []).map((highlight) => (
                <div
                  key={highlight.id}
                  className="rounded-xl border border-[var(--edge-subtle)] bg-[var(--surface-muted)] px-3 py-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-[var(--text-strong)]">{highlight.title}</div>
                    <DeltaPill value={highlight.deltaPct} />
                  </div>
                  <div className="mt-1 font-mono text-lg font-semibold">
                    {typeof highlight.value === "string" ? highlight.value : money(highlight.value)}
                  </div>
                  <div className="mt-1 text-xs text-[var(--text-muted)]">{highlight.detail}</div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-[var(--edge-subtle)] bg-[var(--surface-base)] px-4 py-4">
            <h3 className="text-xl font-semibold text-[var(--text-strong)]">Cash and demand mix</h3>
            <p className="mt-1 text-xs text-[var(--text-muted)]">Where money is coming from</p>
            <div className="mt-3">
              <AdminDonutChart
                rows={tenderRows}
                emptyLabel={isLoading ? "Loading tender mix..." : "No tender mix yet."}
                valueLabel="Tender amount"
                valueFormatter={money}
                height={250}
              />
            </div>
          </section>

          <section className="rounded-2xl border border-[var(--edge-subtle)] bg-[var(--surface-base)] px-4 py-4">
            <h3 className="text-xl font-semibold text-[var(--text-strong)]">Opportunities</h3>
            <div className="mt-3 space-y-2">
              <div className="rounded-xl border border-[var(--edge-subtle)] bg-[var(--surface-muted)] px-3 py-3">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Wallet className="h-4 w-4 text-[var(--text-muted)]" />
                  Seven-day sales
                </div>
                <div className="mt-1 font-mono text-lg">{money(data?.summary.sevenDaySales ?? 0)}</div>
              </div>
              <div className="rounded-xl border border-[var(--edge-subtle)] bg-[var(--surface-muted)] px-3 py-3">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Package className="h-4 w-4 text-[var(--text-muted)]" />
                  Inventory pressure
                </div>
                <div className="mt-1 font-mono text-lg">
                  {(data?.ownerMetrics.kpis.inventoryPressurePct ?? 0).toFixed(1)}%
                </div>
                <p className="mt-1 text-xs text-[var(--text-muted)]">
                  {data?.summary.lowStockCount ?? 0} low-stock items out of{" "}
                  {data?.summary.activeCatalogCount ?? 0} active SKUs
                </p>
              </div>
              <div className="rounded-xl border border-[var(--edge-subtle)] bg-[var(--surface-muted)] px-3 py-3">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <CheckCircle2 className="h-4 w-4 text-[var(--text-muted)]" />
                  Profit model source
                </div>
                <p className="mt-1 text-sm">
                  {data?.ownerMetrics.model === "ACCOUNTING_POSTED"
                    ? "Accounting-posted journals"
                    : "Engineered estimate from retail operations"}
                </p>
              </div>
            </div>
          </section>
        </aside>
      </div>
    </RetailShell>
  );
}
