"use client";

/**
 * Overview — how the shop is trading this month, and what needs somebody.
 *
 * Drawn as the CRM's finance page is, with the management contract's pieces
 * (`components/management/ui`): "Needs action" first, carrying its count, or
 * one sentence when nothing is waiting; then each figure as a heading, one
 * large mono number, a muted line against last month, and what the figure is
 * made of as rows under it — the profit walk from sales to net profit, read
 * top to bottom rather than drawn as a waterfall. Tenders are a list with
 * their share, and the one chart kept is sales by month against the year
 * before, which nothing else on the page says. The till is the page's verb.
 */

import Link from "next/link";
import { useMemo } from "react";
import { Alert, Skeleton } from "@corelithzw/react";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { AdminTrendChart, type TrendChartRow } from "@/components/charts/admin-headless-charts";
import {
  ColumnFigure,
  ColumnList,
  ColumnName,
  ColumnText,
  FactList,
  SectionHeading,
  type FactListItem,
} from "@/components/management/ui";
import { RetailShell } from "@/components/retail/retail-shell";
import { Button } from "@/components/ui/button";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { Payments } from "@/lib/icons";
import { canAccessPosPortal } from "@/lib/retail/pos-host";
import { formatRetailDate, formatSignedMoney, tenderLabel } from "@/lib/retail/words";

type ProfitKey = "netRevenue" | "grossProfit" | "ebitda" | "netProfit";

type RetailDashboardPayload = {
  summary: {
    grossSales: number;
    netSales: number;
    refundValue: number;
    voidValue: number;
    lowStockCount: number;
    ticketCount: number;
  };
  ownerMetrics: {
    model: "ACCOUNTING_POSTED" | "ESTIMATED_FROM_OPERATIONS";
    kpis: {
      grossMarginPct: number;
      /** Gross profit less running costs: before depreciation, interest and tax. */
      ebitdaMarginPct: number;
      netMarginPct: number;
    };
    momentum: {
      revenueDeltaPct: number;
      grossProfitDeltaPct: number;
      ebitdaDeltaPct: number;
      netProfitDeltaPct: number;
    };
    /** Twelve months, this one last, each beside the same month a year earlier. */
    trend: Array<{ id: string; label: string; previousNetRevenue: number } & Record<ProfitKey, number>>;
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
  /** Oldest first, at most eight. */
  openShifts: Array<{
    id: string;
    shiftNo: string;
    registerName: string;
    cashierName: string;
    openedAt: string;
  }>;
};

/** The measure the figures and short lists share with their headings. */
const LIST_WIDTH = 560;
const WIDE = 960;

/** The shop's own calendar day, so a shift opened at 23:50 in Harare is yesterday's. */
const DAY_KEY = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Harare" });

function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}

/** "34.2%", "−3.1%" — with a true minus. */
function percent(value: number) {
  const text = `${Math.abs(value).toFixed(1)}%`;
  return value < 0 ? `−${text}` : text;
}

/**
 * The month against the last, in words. `previous` is read from the trend so
 * a month with nothing to compare against says so, rather than the "up 100%"
 * the server reports for any rise from zero.
 */
function change(deltaPct: number, previous: number | undefined) {
  if (!previous) return "Nothing last month to compare with";
  const size = Math.round(Math.abs(deltaPct));
  if (size === 0) return "Level with last month";
  return `${deltaPct > 0 ? "Up" : "Down"} ${size}% on last month`;
}

export default function RetailOverviewPage() {
  const { data: session } = useSession();
  const canOpenPos = canAccessPosPortal(session?.user?.role);
  const { data, isPending, isError, error } = useQuery({
    queryKey: ["retail-dashboard-owner-overview"],
    queryFn: () => fetchJson<RetailDashboardPayload>("/api/v2/retail"),
  });

  const trendRows = useMemo<TrendChartRow[]>(
    () =>
      (data?.ownerMetrics.trend ?? []).map((row) => ({
        label: row.label,
        netRevenue: row.netRevenue,
        previousNetRevenue: row.previousNetRevenue,
      })),
    [data?.ownerMetrics.trend],
  );

  const actions = canOpenPos ? (
    <Button asChild size="sm">
      <Link href="/portal/pos">
        <Payments className="h-4 w-4" />
        Open the till
      </Link>
    </Button>
  ) : null;

  if (isPending) {
    return (
      <RetailShell title="Overview" actions={actions}>
        <div aria-busy="true" className="space-y-3" style={{ maxWidth: LIST_WIDTH }}>
          <Skeleton height={120} />
          <Skeleton height={160} />
          <Skeleton height={140} />
        </div>
      </RetailShell>
    );
  }

  if (isError) {
    return (
      <RetailShell title="Overview" actions={actions}>
        <Alert tone="danger" title="The trading overview would not load">
          {getApiErrorMessage(error)}
        </Alert>
      </RetailShell>
    );
  }

  const { trend } = data.ownerMetrics;
  // The month before this one, for the line under each figure.
  const lastMonth = trend.length > 1 ? trend[trend.length - 2] : undefined;

  return (
    <RetailShell title="Overview" actions={actions}>
      <div className="pb-10">
        <NeedsAction data={data} />
        {data.summary.ticketCount === 0 ? (
          <section aria-labelledby="overview-month">
            <SectionHeading maxWidth={LIST_WIDTH}>
              <span id="overview-month">Sales this month</span>
            </SectionHeading>
            <p className="text-[13px] text-[var(--text-muted)]">No sales yet this month.</p>
          </section>
        ) : (
          <>
            <Figures data={data} lastMonth={lastMonth} />
            <Tenders rows={data.tenderMix} />
            <section aria-labelledby="overview-by-month">
              <SectionHeading maxWidth={WIDE}>
                <span id="overview-by-month">Sales by month</span>
              </SectionHeading>
              <div style={{ maxWidth: WIDE }}>
                <AdminTrendChart
                  rows={trendRows}
                  series={[
                    { key: "netRevenue", label: "Sales", color: "var(--primary-500)", kind: "line" },
                  ]}
                  comparisonSeries={[
                    {
                      key: "previousNetRevenue",
                      label: "A year earlier",
                      color: "var(--text-muted)",
                      kind: "line",
                      dashed: true,
                    },
                  ]}
                  emptyLabel="No sales in the last year."
                  valueFormatter={formatSignedMoney}
                  yTickFormatter={formatSignedMoney}
                  xTickInterval={0}
                  height={260}
                />
              </div>
            </section>
          </>
        )}
      </div>
    </RetailShell>
  );
}

/**
 * What needs somebody, each a link to where it is dealt with. Only what has
 * something in it is drawn, and the heading counts it; nothing waiting is said
 * once. A shift still open from an earlier day is a drawer nobody cashed up.
 */
function NeedsAction({ data }: { data: RetailDashboardPayload }) {
  const today = DAY_KEY.format(new Date());
  const stale = data.openShifts.filter((shift) => DAY_KEY.format(new Date(shift.openedAt)) < today);
  const low = data.summary.lowStockCount;

  const rows: Array<{ id: string; name: string; meta?: string; href: string; count: string }> = [];
  if (stale.length > 0) {
    const [oldest] = stale;
    rows.push({
      id: "not-cashed-up",
      name: "Shifts not cashed up",
      meta:
        stale.length === 1
          ? `${oldest.registerName} · opened ${formatRetailDate(oldest.openedAt)}`
          : `Oldest opened ${formatRetailDate(oldest.openedAt)}`,
      href: stale.length === 1 ? `/retail/shifts/${oldest.id}` : "/retail/shifts",
      count: plural(stale.length, "shift", "shifts"),
    });
  }
  if (low > 0) {
    rows.push({
      id: "low-stock",
      name: "Low stock",
      href: "/retail/stock",
      count: plural(low, "product", "products"),
    });
  }

  return (
    <section aria-labelledby="overview-needs-action">
      <SectionHeading count={rows.length} maxWidth={LIST_WIDTH} className="mt-0">
        <span id="overview-needs-action">Needs action</span>
      </SectionHeading>
      <ColumnList
        label="Needs action"
        maxWidth={LIST_WIDTH}
        empty="Nothing is waiting on anybody."
        columns={[
          { id: "what", label: "What" },
          { id: "count", label: "How many", align: "end" },
        ]}
        rows={rows.map((row) => ({
          id: row.id,
          cells: {
            what: <ColumnName name={row.name} meta={row.meta} href={row.href} />,
            count: <ColumnText>{row.count}</ColumnText>,
          },
        }))}
      />
    </section>
  );
}

/**
 * Sales down to net profit, a figure at a time, each made of the one above it
 * less what came off. Where no accounts are posted the server estimates the
 * costs below gross profit, and those rows say so.
 */
function Figures({
  data,
  lastMonth,
}: {
  data: RetailDashboardPayload;
  lastMonth: Record<ProfitKey, number> | undefined;
}) {
  const { summary } = data;
  const { kpis, momentum, costBridge: bridge, model } = data.ownerMetrics;
  const estimated = model === "ESTIMATED_FROM_OPERATIONS" ? ", estimated" : "";
  const fact = (label: string, value: number): FactListItem => ({
    label,
    value: formatSignedMoney(value),
    mono: true,
  });
  const margin = (value: number): FactListItem => ({ label: "Margin", value: percent(value), mono: true });

  return (
    <section aria-label="This month's figures" className="grid gap-x-12 md:grid-cols-2">
      <Headline
        heading="Sales this month"
        value={bridge.revenue}
        change={change(momentum.revenueDeltaPct, lastMonth?.netRevenue)}
        facts={[
          fact("Rung up", summary.grossSales),
          fact("Refunds", -summary.refundValue),
          fact("Voids", -summary.voidValue),
        ]}
      />
      <Headline
        heading="Gross profit"
        value={bridge.grossProfit}
        change={change(momentum.grossProfitDeltaPct, lastMonth?.grossProfit)}
        facts={[fact("Sales", bridge.revenue), fact("Cost of sales", -bridge.cogs), margin(kpis.grossMarginPct)]}
      />
      <Headline
        heading="Operating profit"
        value={bridge.ebitda}
        change={change(momentum.ebitdaDeltaPct, lastMonth?.ebitda)}
        facts={[
          fact("Gross profit", bridge.grossProfit),
          fact(`Running costs${estimated}`, -bridge.operatingExpense),
          margin(kpis.ebitdaMarginPct),
        ]}
      />
      <Headline
        heading="Net profit"
        value={bridge.netProfit}
        change={change(momentum.netProfitDeltaPct, lastMonth?.netProfit)}
        facts={[
          fact("Operating profit", bridge.ebitda),
          fact(`Depreciation, interest and tax${estimated}`, -bridge.belowEbitda),
          margin(kpis.netMarginPct),
        ]}
      />
    </section>
  );
}

function Headline({
  heading,
  value,
  change: against,
  facts,
}: {
  heading: string;
  value: number;
  change: string;
  facts: FactListItem[];
}) {
  return (
    <div className="min-w-0">
      <SectionHeading maxWidth={LIST_WIDTH}>{heading}</SectionHeading>
      <p className="font-mono text-[28px] font-semibold leading-tight tracking-[-0.01em] tabular-nums text-[var(--text-strong)]">
        {formatSignedMoney(value)}
      </p>
      <p className="mb-2 mt-1 text-[13px] text-[var(--text-muted)]">{against}</p>
      <FactList items={facts} align="end" maxWidth={LIST_WIDTH} labelWidth={240} />
    </div>
  );
}

/** What this month was paid with, largest first, and each tender's share of it. */
function Tenders({ rows }: { rows: RetailDashboardPayload["tenderMix"] }) {
  const sorted = rows.slice().sort((a, b) => b.amount - a.amount);
  const total = sorted.reduce((sum, row) => sum + row.amount, 0);
  const share = (amount: number) => (total > 0 ? `${Math.round((amount / total) * 100)}%` : "—");

  return (
    <section aria-labelledby="overview-tenders">
      <SectionHeading maxWidth={LIST_WIDTH}>
        <span id="overview-tenders">Tenders</span>
      </SectionHeading>
      <ColumnList
        label="Tenders"
        maxWidth={LIST_WIDTH}
        empty="No tenders taken this month."
        columns={[
          { id: "tender", label: "Tender" },
          { id: "share", label: "Share", align: "end" },
          { id: "amount", label: "Amount", align: "end" },
        ]}
        rows={sorted.map((row) => ({
          id: row.tenderType,
          cells: {
            tender: <ColumnName name={tenderLabel(row.tenderType)} />,
            share: <ColumnFigure tone="muted">{share(row.amount)}</ColumnFigure>,
            amount: <ColumnFigure>{formatSignedMoney(row.amount)}</ColumnFigure>,
          },
        }))}
        total={
          sorted.length > 1
            ? { tender: "Total", share: null, amount: <ColumnFigure>{formatSignedMoney(total)}</ColumnFigure> }
            : undefined
        }
      />
    </section>
  );
}
