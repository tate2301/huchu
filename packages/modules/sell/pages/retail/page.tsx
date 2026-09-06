"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Alert, Badge, Card, EmptyState, Skeleton, StatCard } from "@corelithzw/react";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import {
  AdminDonutChart,
  AdminTrendChart,
  AdminWaterfallChart,
  type DistributionRow,
  type TrendChartRow,
  type WaterfallRow,
} from "@corelithzw/ui/charts/admin-headless-charts";
import { RetailShell } from "../../components/retail-shell";
import { Button } from "@corelithzw/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@corelithzw/ui/components/dropdown-menu";
import { fetchJson, getApiErrorMessage } from "@corelithzw/platform/api-client";
import {
  BarChart3,
  Building2,
  ClipboardList,
  ChevronDown,
  Grid3x3,
  LocalShipping,
  Package,
  Payments,
  Users,
} from "@corelithzw/ui/lib/icons";
import { hasTokenFeature } from "@corelithzw/platform/gating/token-check";
import { canAccessPosPortal } from "../../pos-host";

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
      grossProfit: number;
      operatingExpense: number;
      ebitda: number;
      /** Depreciation, interest and tax as one step — `ebitda − netProfit`. */
      belowEbitda: number;
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

/**
 * A momentum reading for `StatCard`'s delta slot.
 *
 * The direction — not a colour written here — is what tints it. The tile that
 * this replaced carried its own emerald/rose pill with hard-coded Tailwind
 * palette classes, which is the thing that made retail look like a second
 * design system.
 */
function delta(value: number) {
  return {
    direction: value >= 0 ? ("up" as const) : ("down" as const),
    label: `${pct(value)} on the previous period`,
  };
}

export default function RetailOverviewPage() {
  const { data: session } = useSession();
  const enabledFeatures = (session?.user as { enabledFeatures?: string[] } | undefined)?.enabledFeatures;
  const canOpenPos = canAccessPosPortal(session?.user?.role);
  const canOpenCustomers = hasTokenFeature(enabledFeatures, "crm.customers");
  const { data, isPending, isError, error } = useQuery({
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

  /**
   * The P&L as a walk from revenue to the bottom line.
   *
   * Every row is a **delta** except the ones marked `isSubtotal`, which restate
   * where the walk has got to. Mixing the two was the bug: EBITDA and Net were
   * passed as running totals and the chart added them like movements, so it
   * counted the same money three times and closed at about $2,900 on a month
   * whose net profit was $719.
   *
   * The steps have to reconcile or the picture lies, so `belowEbitda` — the
   * depreciation, interest and tax between EBITDA and net — is derived on the
   * server as `ebitda − netProfit` rather than re-summed here.
   */
  const bridgeRows = useMemo<WaterfallRow[]>(() => {
    const bridge = data?.ownerMetrics.costBridge;
    return [
      {
        id: "revenue",
        label: "Revenue",
        value: bridge?.revenue ?? 0,
        tone: "success",
      },
      {
        id: "cogs",
        label: "COGS",
        value: -(bridge?.cogs ?? 0),
        tone: "warning",
      },
      {
        id: "gross-profit",
        label: "Gross profit",
        value: bridge?.grossProfit ?? 0,
        tone: "default",
        isSubtotal: true,
      },
      {
        id: "opex",
        label: "OpEx",
        value: -(bridge?.operatingExpense ?? 0),
        tone: "warning",
      },
      {
        id: "ebitda",
        label: "EBITDA",
        value: bridge?.ebitda ?? 0,
        tone: "default",
        isSubtotal: true,
      },
      {
        // Depreciation, interest and tax, as one step. Named for what it is
        // rather than "Other", so nobody has to guess what the shop paid.
        id: "below-ebitda",
        label: "D&A, interest, tax",
        value: -(bridge?.belowEbitda ?? 0),
        tone: "warning",
      },
      {
        id: "net",
        label: "Net profit",
        value: bridge?.netProfit ?? 0,
        tone: (bridge?.netProfit ?? 0) >= 0 ? "success" : "danger",
        isSubtotal: true,
      },
    ];
  }, [data]);

  const actions = (
    <div className="flex items-center gap-2">
      {canOpenPos ? (
        <Button asChild size="sm">
          <Link href="/portal/pos">
            <Payments className="h-4 w-4" />
            POS
          </Link>
        </Button>
      ) : null}
      <Button asChild size="sm" variant="outline">
        <Link href="/retail/sales">
          <ClipboardList className="h-4 w-4" />
          Sell
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
            <Link href="/retail/stock" className="flex items-center gap-2">
              <Package className="h-4 w-4" /> Stock
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/retail/purchasing/orders" className="flex items-center gap-2">
              <LocalShipping className="h-4 w-4" /> Buy
            </Link>
          </DropdownMenuItem>
          {canOpenCustomers ? (
            <DropdownMenuItem asChild>
              <Link href="/retail/customers" className="flex items-center gap-2">
                <Users className="h-4 w-4" /> Customers
              </Link>
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem asChild>
            <Link href="/retail/reports" className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" /> Reports
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/retail/setup" className="flex items-center gap-2">
              <Building2 className="h-4 w-4" /> Setup
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );

  if (isPending) {
    return (
      <RetailShell title="Business overview" actions={actions}>
        <div aria-busy="true" aria-live="polite" className="space-y-4">
          <span className="sr-only">Reading the trading figures…</span>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Skeleton height={104} />
            <Skeleton height={104} />
            <Skeleton height={104} />
          </div>
          <Skeleton height={320} />
          <div className="grid gap-4 xl:grid-cols-2">
            <Skeleton height={300} />
            <Skeleton height={300} />
          </div>
        </div>
      </RetailShell>
    );
  }

  if (isError) {
    return (
      <RetailShell title="Business overview" actions={actions}>
        <Alert tone="danger" title="The trading overview would not load">
          {getApiErrorMessage(error)}
        </Alert>
      </RetailShell>
    );
  }

  if (data.summary.ticketCount === 0) {
    return (
      <RetailShell title="Business overview" actions={actions}>
        <EmptyState
          title="No trade recorded yet"
          body="Sales, margin and tender mix appear here once the till has rung up its first sale of the day."
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

  const { kpis, momentum, highlights, costBridge } = data.ownerMetrics;

  return (
    <RetailShell title="Business overview" actions={actions}>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <StatCard
              label="Gross profit"
              value={money(kpis.grossProfit)}
              delta={delta(momentum.grossProfitDeltaPct)}
              footer={`Margin ${kpis.grossMarginPct.toFixed(1)}%`}
            />
            <StatCard
              label="EBITDA"
              value={money(kpis.ebitda)}
              delta={delta(momentum.ebitdaDeltaPct)}
              footer={`Margin ${kpis.ebitdaMarginPct.toFixed(1)}%`}
            />
            <StatCard
              label="Net profit"
              value={money(kpis.netProfit)}
              delta={delta(momentum.netProfitDeltaPct)}
              footer={`Margin ${kpis.netMarginPct.toFixed(1)}%`}
            />
          </div>

          <Card
            title="Volume"
            subtitle={`Revenue run-rate ${money(kpis.monthlyRunRateRevenue)} a month`}
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
              emptyLabel="No revenue trend for this period."
              valueFormatter={money}
              yTickFormatter={money}
              xTickInterval={0}
              height={260}
            />
          </Card>

          <div className="grid gap-5 xl:grid-cols-2">
            <Card
              title="Performance"
              subtitle={`Gross margin ${kpis.grossMarginPct.toFixed(1)}%`}
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
                emptyLabel="No profitability trend for this period."
                valueFormatter={money}
                yTickFormatter={money}
                xTickInterval={0}
                height={250}
              />
            </Card>

            <Card
              title="Profit bridge"
              subtitle={`Net profit ${money(costBridge.netProfit)}`}
            >
              <AdminWaterfallChart
                rows={bridgeRows}
                emptyLabel="No bridge data for this period."
                valueFormatter={money}
                yTickFormatter={money}
                height={250}
              />
            </Card>
          </div>
        </div>

        <aside className="space-y-4">
          <Card title="Priorities" subtitle={`${highlights.length} to look at`}>
            {highlights.length === 0 ? (
              <EmptyState
                title="Nothing needs attention"
                body="Anomalies and wins appear here as the day trades."
              />
            ) : (
              <ul className="space-y-3">
                {highlights.map((highlight) => (
                  <li
                    key={highlight.id}
                    className="border-b border-[color:var(--border-subtle)] pb-3 last:border-b-0 last:pb-0"
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <h3 className="t-body-sm t-strong font-semibold">{highlight.title}</h3>
                      <Badge tone={highlight.deltaPct >= 0 ? "success" : "danger"}>
                        {pct(highlight.deltaPct)}
                      </Badge>
                    </div>
                    <p className="t-strong mt-1 font-mono text-base font-semibold tabular-nums">
                      {typeof highlight.value === "string" ? highlight.value : money(highlight.value)}
                    </p>
                    <p className="t-caption t-muted mt-1">{highlight.detail}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Cash and demand mix">
            <AdminDonutChart
              rows={tenderRows}
              emptyLabel="No tender mix yet."
              valueLabel="Tender amount"
              valueFormatter={money}
              height={250}
            />
          </Card>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
            <StatCard
              label="Seven-day sales"
              value={money(data.summary.sevenDaySales)}
              footer="Rolling week, tills combined"
            />
            <StatCard
              label="Inventory pressure"
              value={`${kpis.inventoryPressurePct.toFixed(1)}%`}
              footer={`${data.summary.lowStockCount} lines at or under reorder`}
              tone={kpis.inventoryPressurePct > 50 ? "warn" : "neutral"}
            />
          </div>
        </aside>
      </div>
    </RetailShell>
  );
}
