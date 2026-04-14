"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AdminDistributionChart,
  AdminDonutChart,
  AdminTrendChart,
} from "@/components/charts/admin-headless-charts";
import { BarChart3, Calendar, RefreshCcw, TrendingUp, Wallet } from "@/lib/icons";
import { fetchJson } from "@/lib/api-client";
import {
  PosEmptyState,
  PosMetricCard,
  PosPanel,
  PosPanelHeader,
} from "./pos-primitives";
import { money, round } from "./pos-utils";
import type { SaleRow } from "./pos-types";

function formatDateLabel(date: Date) {
  return date.toLocaleDateString(undefined, { weekday: "short", day: "numeric" });
}

function startOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function PosReportsView() {
  const today = useMemo(() => startOfDay(new Date()), []);
  const sevenDaysAgo = useMemo(() => {
    const d = new Date(today);
    d.setDate(d.getDate() - 6);
    return d;
  }, [today]);

  const salesQuery = useQuery({
    queryKey: ["retail-pos-sales", "reports", sevenDaysAgo.toISOString(), today.toISOString()],
    queryFn: () =>
      fetchJson<{
        data: Array<
          SaleRow & {
            payments: Array<{ id: string; tenderType: string; amount: number }>;
            lines: Array<{ id: string; itemName: string; quantity: number; unitPrice: number; lineTotal: number }>;
          }
        >;
        summary?: {
          grossSales: number;
          refundValue: number;
          voidValue: number;
          netSales: number;
        };
      }>(
        `/api/v2/retail/pos/sales?scope=mine&limit=200&from=${encodeURIComponent(
          sevenDaysAgo.toISOString(),
        )}&to=${encodeURIComponent(today.toISOString())}`,
      ),
  });

  const summary = salesQuery.data?.summary;
  const salesData = useMemo(() => salesQuery.data?.data ?? [], [salesQuery.data?.data]);

  const {
    trendRows,
    paymentRows,
    topItemRows,
    totalTransactions,
    avgBasket,
    refundTotal,
  } = useMemo(() => {
    const days: Record<string, number> = {};
    for (let i = 0; i < 7; i += 1) {
      const d = new Date(sevenDaysAgo);
      d.setDate(d.getDate() + i);
      days[d.toISOString().split("T")[0]] = 0;
    }

    const paymentsMap: Record<string, number> = {};
    const itemsMap: Record<string, number> = {};
    let txCount = 0;
    let refundSum = 0;

    salesData.forEach((sale) => {
      if (sale.status !== "POSTED") return;
      const dayKey = new Date(sale.postedAt).toISOString().split("T")[0];
      if (dayKey in days) {
        days[dayKey] += sale.totalAmount;
      }

      if (sale.saleType === "SALE") {
        txCount += 1;
      } else if (sale.saleType === "REFUND") {
        refundSum += Math.abs(sale.totalAmount);
      }

      sale.payments?.forEach((p) => {
        paymentsMap[p.tenderType] = (paymentsMap[p.tenderType] ?? 0) + p.amount;
      });

      sale.lines?.forEach((line) => {
        itemsMap[line.itemName] = (itemsMap[line.itemName] ?? 0) + Math.abs(line.lineTotal);
      });
    });

    const trend = Object.entries(days)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, value]) => ({
        label: formatDateLabel(new Date(date)),
        sales: round(value),
      }));

    const paymentPalette = [
      "var(--primary-500)",
      "var(--accent-500)",
      "var(--success-500)",
      "var(--warning-500)",
      "var(--info-500)",
    ];
    const paymentEntries = Object.entries(paymentsMap).sort((a, b) => b[1] - a[1]);
    const pRows = paymentEntries.map(([label, value], index) => ({
      id: label,
      label: label.replace(/_/g, " "),
      value: round(value),
      color: paymentPalette[index % paymentPalette.length],
    }));

    const itemEntries = Object.entries(itemsMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);
    const iRows = itemEntries.map(([label, value], index) => ({
      id: label,
      label,
      value: round(value),
      tone: (index === 0 ? "success" : "default") as "success" | "default",
    }));

    const netSales = summary?.netSales ?? Object.values(days).reduce((a, b) => a + b, 0);
    const averageBasket = txCount > 0 ? netSales / txCount : 0;

    return {
      trendRows: trend,
      paymentRows: pRows,
      topItemRows: iRows,
      totalTransactions: txCount,
      avgBasket: averageBasket,
      refundTotal: refundSum,
    };
  }, [salesData, summary, sevenDaysAgo]);

  const hasData = salesData.length > 0;

  return (
    <div className="h-full min-h-0 overflow-y-auto pr-1">
      <div className="space-y-4 pb-1">
        {/* Header */}
        <PosPanel>
          <PosPanelHeader
            eyebrow="Performance"
            title="This week at a glance"
            description="Sales, payments, and top products for the last 7 days."
            actions={
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--surface-muted)] px-2.5 py-1 text-[11px] font-medium text-[var(--text-muted)]">
                <Calendar className="h-3.5 w-3.5" />
                Last 7 days
              </span>
            }
          />

          {/* Metrics */}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <PosMetricCard
              icon={Wallet}
              label="Total sales"
              value={money(summary?.netSales ?? trendRows.reduce((a, b) => a + b.sales, 0))}
              meta="Net sales this week"
              tone="success"
            />
            <PosMetricCard
              icon={TrendingUp}
              label="Transactions"
              value={String(totalTransactions)}
              meta="Posted sales"
              tone="brand"
            />
            <PosMetricCard
              icon={BarChart3}
              label="Avg. basket"
              value={money(avgBasket)}
              meta="Average sale value"
              tone="neutral"
            />
            <PosMetricCard
              icon={RefreshCcw}
              label="Refunds"
              value={money(refundTotal)}
              meta="Total refund value"
              tone="danger"
            />
          </div>
        </PosPanel>

        {/* Charts */}
        {hasData ? (
          <>
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(320px,1fr)]">
              <PosPanel className="min-h-0">
                <PosPanelHeader
                  eyebrow="Trend"
                  title="Daily sales"
                  description="Sales value per day over the last 7 days."
                />
                <AdminTrendChart
                  rows={trendRows}
                  series={[{ key: "sales", label: "Sales", kind: "bar", tone: "success" }]}
                  height={280}
                  valueFormatter={(v) => money(v)}
                  yTickFormatter={(v) => money(v)}
                  xTickInterval={0}
                />
              </PosPanel>

              <PosPanel className="min-h-0">
                <PosPanelHeader
                  eyebrow="Composition"
                  title="Payment methods"
                  description="How customers paid this week."
                />
                <AdminDonutChart
                  rows={paymentRows}
                  height={280}
                  valueLabel="Total"
                  valueFormatter={(v) => money(v)}
                  emptyLabel="No payment data"
                />
              </PosPanel>
            </div>

            <PosPanel className="min-h-0">
              <PosPanelHeader
                eyebrow="Products"
                title="Top selling items"
                description="Highest revenue items this week."
              />
              <AdminDistributionChart
                rows={topItemRows}
                height={280}
                valueLabel="Revenue"
                valueFormatter={(v) => money(v)}
                emptyLabel="No item data"
              />
            </PosPanel>
          </>
        ) : salesQuery.isLoading ? (
          <PosPanel>
            <div className="flex min-h-[16rem] items-center justify-center text-sm text-[var(--text-muted)]">
              Loading reports…
            </div>
          </PosPanel>
        ) : (
          <PosPanel>
            <PosEmptyState
              icon={BarChart3}
              title="No sales data"
              description="There are no transactions in the last 7 days to report on."
            />
          </PosPanel>
        )}
      </div>
    </div>
  );
}
