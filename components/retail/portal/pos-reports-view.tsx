"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AdminDistributionChart,
  AdminDonutChart,
  AdminTrendChart,
} from "@/components/charts/admin-headless-charts";
import {
  BarChart3,
  Clock,
  Package,
  RefreshCcw,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "@/lib/icons";
import { fetchJson } from "@/lib/api-client";
import {
  PosEmptyState,
  PosMetricCard,
  PosPanel,
  PosPanelHeader,
} from "./pos-primitives";
import { usePosPortalState } from "./pos-portal-state";
import { money, round } from "./pos-utils";
import type { SaleRow } from "./pos-types";
import { cn } from "@/lib/utils";

/* ─── Helpers ─────────────────────────────────────────────────────── */

function formatDateLabel(date: Date) {
  return date.toLocaleDateString(undefined, { weekday: "short", day: "numeric" });
}

function startOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function formatHour(hour: number) {
  if (hour === 0) return "12am";
  if (hour < 12) return `${hour}am`;
  if (hour === 12) return "12pm";
  return `${hour - 12}pm`;
}

type Period = "today" | "week";

type SaleWithDetail = SaleRow & {
  payments: Array<{ id: string; tenderType: string; amount: number }>;
  lines: Array<{ id: string; itemName: string; quantity: number; unitPrice: number; lineTotal: number }>;
};

/* ─── Shift Summary Banner ────────────────────────────────────────── */

function ShiftBanner({ shift }: { shift: NonNullable<ReturnType<typeof usePosPortalState>["currentShift"]> }) {
  const cashSalesFormatted = money(shift.cashSales);
  const nonCashFormatted = money(shift.nonCashSales);
  return (
    <div
      className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl px-5 py-3.5 ring-1"
      style={{ background: "var(--pos-status-success-bg)", boxShadow: `inset 0 0 0 1px var(--pos-status-success-ring)` }}
    >
      <div className="flex items-center gap-2">
        <span
          className="h-2 w-2 rounded-full"
          style={{ background: "var(--pos-status-success-text)" }}
        />
        <span
          className="text-[13px] font-bold"
          style={{ color: "var(--pos-status-success-text)" }}
        >
          Shift {shift.shiftNo}
        </span>
        <span
          className="rounded px-1.5 py-0.5 text-[11px] font-semibold"
          style={{ background: "var(--pos-status-success-ring)", color: "var(--pos-status-success-text)" }}
        >
          {shift.registerName}
        </span>
      </div>
      <div
        className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[12px]"
        style={{ color: "var(--pos-status-success-text)" }}
      >
        <span>
          <span className="font-bold">{shift.saleCount}</span> sale{shift.saleCount !== 1 ? "s" : ""}
        </span>
        <span>
          Cash <span className="font-bold">{cashSalesFormatted}</span>
        </span>
        <span>
          Non-cash <span className="font-bold">{nonCashFormatted}</span>
        </span>
        {shift.refundCount > 0 && (
          <span className="text-amber-700">
            <span className="font-bold">{shift.refundCount}</span> refund{shift.refundCount !== 1 ? "s" : ""}
          </span>
        )}
      </div>
    </div>
  );
}

/* ─── Period tab pill ──────────────────────────────────────────────── */

function PeriodTab({
  label,
  active,
  onClick,
}: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex-1 rounded-lg px-4 py-1.5 text-[13px] font-semibold transition-all duration-100",
        active
          ? "bg-[var(--surface-base)] text-[var(--text-strong)] shadow-[0_1px_3px_rgba(0,0,0,0.08),inset_0_0_0_1px_var(--border-default)]"
          : "text-[var(--text-muted)] hover:text-[var(--text-strong)]",
      )}
    >
      {label}
    </button>
  );
}

/* ─── Trend indicator ─────────────────────────────────────────────── */

function TrendChip({ value, label }: { value: number; label: string }) {
  if (value === 0) return null;
  const isUp = value > 0;
  return (
    <span
      className="inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1"
      style={
        isUp
          ? { background: "var(--pos-status-success-bg)", boxShadow: `inset 0 0 0 1px var(--pos-status-success-ring)`, color: "var(--pos-status-success-text)" }
          : { background: "var(--pos-status-danger-bg)", boxShadow: `inset 0 0 0 1px var(--pos-status-danger-ring)`, color: "var(--pos-status-danger-text)" }
      }
    >
      {isUp ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {Math.abs(value).toFixed(0)}% {label}
    </span>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════════ */

export function PosReportsView() {
  const [period, setPeriod] = useState<Period>("today");
  const { currentShift } = usePosPortalState();

  const today = useMemo(() => startOfDay(new Date()), []);
  const sevenDaysAgo = useMemo(() => {
    const d = new Date(today);
    d.setDate(d.getDate() - 6);
    return startOfDay(d);
  }, [today]);
  const to = useMemo(() => endOfDay(new Date()), []);

  const salesQuery = useQuery({
    queryKey: ["retail-pos-sales", "reports", sevenDaysAgo.toISOString(), to.toISOString()],
    queryFn: () =>
      fetchJson<{
        data: SaleWithDetail[];
        summary?: {
          grossSales: number;
          refundValue: number;
          voidValue: number;
          netSales: number;
        };
      }>(
        `/api/v2/retail/pos/sales?scope=mine&limit=200&from=${encodeURIComponent(
          sevenDaysAgo.toISOString(),
        )}&to=${encodeURIComponent(to.toISOString())}`,
      ),
  });

  const summary = salesQuery.data?.summary;
  const allSales = useMemo(() => salesQuery.data?.data ?? [], [salesQuery.data?.data]);

  /* ── Split sales into today vs rest of week ─────── */
  const { todaySales, weekSales } = useMemo(() => {
    const todayStr = today.toISOString().split("T")[0];
    const todayData: SaleWithDetail[] = [];
    const weekData: SaleWithDetail[] = [];
    allSales.forEach((sale) => {
      const dayStr = new Date(sale.postedAt).toISOString().split("T")[0];
      if (dayStr === todayStr) {
        todayData.push(sale);
        weekData.push(sale);
      } else {
        weekData.push(sale);
      }
    });
    return { todaySales: todayData, weekSales: weekData };
  }, [allSales, today]);

  /* ── Today metrics ──────────────────────────────── */
  const todayMetrics = useMemo(() => {
    // Hourly buckets (only show hours with data + surrounding context)
    const hours: Record<number, number> = {};
    for (let i = 0; i < 24; i++) hours[i] = 0;

    const paymentsMap: Record<string, number> = {};
    const itemsMap: Record<string, number> = {};
    let txCount = 0;
    let refundSum = 0;
    let totalRevenue = 0;

    todaySales.forEach((sale) => {
      if (sale.status !== "POSTED") return;
      const hour = new Date(sale.postedAt).getHours();
      if (sale.saleType === "SALE") {
        hours[hour] = (hours[hour] ?? 0) + sale.totalAmount;
        txCount += 1;
        totalRevenue += sale.totalAmount;
      } else if (sale.saleType === "REFUND") {
        refundSum += Math.abs(sale.totalAmount);
      }

      sale.payments?.forEach((p) => {
        paymentsMap[p.tenderType] = (paymentsMap[p.tenderType] ?? 0) + p.amount;
      });

      sale.lines?.forEach((line) => {
        if (sale.saleType === "SALE") {
          itemsMap[line.itemName] = (itemsMap[line.itemName] ?? 0) + Math.abs(line.lineTotal);
        }
      });
    });

    // Find the active hour range (first sale to now + buffer)
    const currentHour = new Date().getHours();
    let firstSaleHour = currentHour;
    for (let i = 0; i <= currentHour; i++) {
      if (hours[i] > 0) { firstSaleHour = i; break; }
    }
    const startHour = Math.max(0, firstSaleHour - 1);
    const endHour = Math.min(23, currentHour + 1);

    const hourRows = [];
    for (let i = startHour; i <= endHour; i++) {
      hourRows.push({ label: formatHour(i), sales: round(hours[i]) });
    }

    const paymentPalette = ["var(--primary-500)", "var(--accent-500)", "var(--success-500)", "var(--warning-500)"];
    const paymentRows = Object.entries(paymentsMap)
      .sort((a, b) => b[1] - a[1])
      .map(([label, value], i) => ({
        id: label,
        label: label.replace(/_/g, " "),
        value: round(value),
        color: paymentPalette[i % paymentPalette.length],
      }));

    const topItemRows = Object.entries(itemsMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([label, value], i) => ({
        id: label,
        label,
        value: round(value),
        tone: (i === 0 ? "success" : "default") as "success" | "default",
      }));

    // Find peak hour
    const peakHour = Object.entries(hours).reduce(
      (best, [h, v]) => (v > best.value ? { hour: Number(h), value: v } : best),
      { hour: -1, value: -1 },
    );

    return {
      hourRows,
      paymentRows,
      topItemRows,
      txCount,
      refundSum,
      totalRevenue,
      avgBasket: txCount > 0 ? totalRevenue / txCount : 0,
      peakHour: peakHour.value > 0 ? peakHour.hour : null,
    };
  }, [todaySales]);

  /* ── Week metrics ───────────────────────────────── */
  const weekMetrics = useMemo(() => {
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

    weekSales.forEach((sale) => {
      if (sale.status !== "POSTED") return;
      const dayKey = new Date(sale.postedAt).toISOString().split("T")[0];
      if (dayKey in days) {
        if (sale.saleType === "SALE") days[dayKey] += sale.totalAmount;
      }
      if (sale.saleType === "SALE") txCount += 1;
      else if (sale.saleType === "REFUND") refundSum += Math.abs(sale.totalAmount);

      sale.payments?.forEach((p) => {
        paymentsMap[p.tenderType] = (paymentsMap[p.tenderType] ?? 0) + p.amount;
      });
      sale.lines?.forEach((line) => {
        if (sale.saleType === "SALE") {
          itemsMap[line.itemName] = (itemsMap[line.itemName] ?? 0) + Math.abs(line.lineTotal);
        }
      });
    });

    const trendRows = Object.entries(days)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, value]) => ({
        label: formatDateLabel(new Date(date + "T12:00:00")),
        sales: round(value),
      }));

    const paymentPalette = ["var(--primary-500)", "var(--accent-500)", "var(--success-500)", "var(--warning-500)", "var(--info-500)"];
    const paymentRows = Object.entries(paymentsMap)
      .sort((a, b) => b[1] - a[1])
      .map(([label, value], i) => ({
        id: label,
        label: label.replace(/_/g, " "),
        value: round(value),
        color: paymentPalette[i % paymentPalette.length],
      }));

    const topItemRows = Object.entries(itemsMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([label, value], i) => ({
        id: label,
        label,
        value: round(value),
        tone: (i === 0 ? "success" : "default") as "success" | "default",
      }));

    const netSales = summary?.netSales ?? Object.values(days).reduce((a, b) => a + b, 0);

    // Compare first half of week vs second half
    const dayValues = Object.values(days);
    const firstHalf = dayValues.slice(0, 3).reduce((a, b) => a + b, 0);
    const secondHalf = dayValues.slice(3).reduce((a, b) => a + b, 0);
    const weekTrend = firstHalf > 0 ? Math.round(((secondHalf - firstHalf) / firstHalf) * 100) : 0;

    return {
      trendRows,
      paymentRows,
      topItemRows,
      txCount,
      refundSum,
      netSales,
      avgBasket: txCount > 0 ? netSales / txCount : 0,
      weekTrend,
    };
  }, [weekSales, summary, sevenDaysAgo]);

  const hasData = allSales.length > 0;
  const todayHasData = todaySales.length > 0;

  /* ══ Render ══════════════════════════════════════════════════════ */

  return (
    <div className="h-full min-h-0 overflow-y-auto pr-1">
      <div className="space-y-4 pb-4">

        {/* ── Current shift banner ─────────────────────────── */}
        {currentShift && <ShiftBanner shift={currentShift} />}

        {/* ── Period tabs ──────────────────────────────────── */}
        <div className="flex gap-1 rounded-xl bg-[var(--surface-muted)] p-1">
          <PeriodTab label="Today" active={period === "today"} onClick={() => setPeriod("today")} />
          <PeriodTab label="This week" active={period === "week"} onClick={() => setPeriod("week")} />
        </div>

        {/* ══ ERROR / LOADING ════════════════════════════════ */}
        {salesQuery.isError ? (
          <PosPanel>
            <PosEmptyState
              icon={RefreshCcw}
              title="Unable to load reports"
              description="There was a problem fetching your sales data. Please try again later."
            />
          </PosPanel>
        ) : salesQuery.isLoading ? (
          <>
            <PosPanel>
              <div className="flex min-h-[8rem] items-center justify-center text-sm text-[var(--text-muted)]">
                Loading reports…
              </div>
            </PosPanel>
          </>
        ) : (

          /* ══ TODAY ═══════════════════════════════════════════════ */
          period === "today" ? (
            <>
              {/* Metric cards */}
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <PosMetricCard
                  icon={Wallet}
                  label="Revenue today"
                  value={money(todayMetrics.totalRevenue)}
                  meta={currentShift ? `Shift ${currentShift.shiftNo}` : "Current day"}
                  tone="success"
                />
                <PosMetricCard
                  icon={Package}
                  label="Transactions"
                  value={String(todayMetrics.txCount)}
                  meta="Completed sales"
                  tone="brand"
                />
                <PosMetricCard
                  icon={BarChart3}
                  label="Avg. basket"
                  value={money(todayMetrics.avgBasket)}
                  meta="Per transaction"
                  tone="neutral"
                />
                <PosMetricCard
                  icon={RefreshCcw}
                  label="Refunds"
                  value={money(todayMetrics.refundSum)}
                  meta="Returned today"
                  tone={todayMetrics.refundSum > 0 ? "danger" : "neutral"}
                />
              </div>

              {/* Peak hour callout */}
              {todayMetrics.peakHour !== null && (
                <div className="flex items-center gap-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-4 py-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--action-primary-bg)_12%,var(--surface-base))] text-[var(--action-primary-bg)]">
                    <Clock className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="text-[12px] font-bold text-[var(--text-strong)]">
                      Peak hour: <span className="text-[var(--action-primary-bg)]">{formatHour(todayMetrics.peakHour)}</span>
                    </div>
                    <div className="text-[11px] text-[var(--text-muted)]">
                      Busiest period so far today
                    </div>
                  </div>
                </div>
              )}

              {!todayHasData ? (
                <PosPanel>
                  <PosEmptyState
                    icon={BarChart3}
                    title="No sales yet today"
                    description="Complete a transaction to see today's performance metrics and hourly breakdown."
                  />
                </PosPanel>
              ) : (
                <>
                  {/* Hourly trend */}
                  <PosPanel className="min-h-0">
                    <PosPanelHeader
                      eyebrow="Hourly"
                      title="Sales by hour"
                      description="Transaction revenue broken down by hour of day."
                    />
                    <AdminTrendChart
                      rows={todayMetrics.hourRows}
                      series={[{ key: "sales", label: "Sales", kind: "bar", tone: "success" }]}
                      height={220}
                      valueFormatter={(v) => money(v)}
                      yTickFormatter={(v) => money(v)}
                      xTickInterval={0}
                    />
                  </PosPanel>

                  <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.85fr)]">
                    {/* Payment methods */}
                    <PosPanel className="min-h-0">
                      <PosPanelHeader
                        eyebrow="Today"
                        title="Payment methods"
                        description="How customers paid today."
                      />
                      <AdminDonutChart
                        rows={todayMetrics.paymentRows}
                        height={240}
                        valueLabel="Total"
                        valueFormatter={(v) => money(v)}
                        emptyLabel="No payment data"
                      />
                    </PosPanel>

                    {/* Top items */}
                    <PosPanel className="min-h-0">
                      <PosPanelHeader
                        eyebrow="Today"
                        title="Top items"
                        description="Best sellers today."
                      />
                      <AdminDistributionChart
                        rows={todayMetrics.topItemRows}
                        height={240}
                        valueLabel="Revenue"
                        valueFormatter={(v) => money(v)}
                        emptyLabel="No item data"
                      />
                    </PosPanel>
                  </div>
                </>
              )}
            </>
          ) : (

          /* ══ THIS WEEK ════════════════════════════════════════════ */
            <>
              {/* Metric cards */}
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <PosMetricCard
                  icon={Wallet}
                  label="Net sales"
                  value={money(weekMetrics.netSales)}
                  meta={
                    <span className="flex items-center gap-1">
                      Last 7 days
                      {weekMetrics.weekTrend !== 0 && (
                        <TrendChip value={weekMetrics.weekTrend} label="vs prior" />
                      )}
                    </span>
                  }
                  tone="success"
                />
                <PosMetricCard
                  icon={Package}
                  label="Transactions"
                  value={String(weekMetrics.txCount)}
                  meta="Completed sales"
                  tone="brand"
                />
                <PosMetricCard
                  icon={BarChart3}
                  label="Avg. basket"
                  value={money(weekMetrics.avgBasket)}
                  meta="Per transaction"
                  tone="neutral"
                />
                <PosMetricCard
                  icon={RefreshCcw}
                  label="Refunds"
                  value={money(weekMetrics.refundSum)}
                  meta="Total refund value"
                  tone={weekMetrics.refundSum > 0 ? "danger" : "neutral"}
                />
              </div>

              {!hasData ? (
                <PosPanel>
                  <PosEmptyState
                    icon={BarChart3}
                    title="No sales data this week"
                    description="There are no transactions in the last 7 days to report on."
                  />
                </PosPanel>
              ) : (
                <>
                  {/* Daily trend */}
                  <PosPanel className="min-h-0">
                    <PosPanelHeader
                      eyebrow="Trend"
                      title="Daily sales"
                      description="Sales value per day over the last 7 days."
                    />
                    <AdminTrendChart
                      rows={weekMetrics.trendRows}
                      series={[{ key: "sales", label: "Sales", kind: "bar", tone: "success" }]}
                      height={260}
                      valueFormatter={(v) => money(v)}
                      yTickFormatter={(v) => money(v)}
                      xTickInterval={0}
                    />
                  </PosPanel>

                  <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(280px,1fr)]">
                    {/* Payment methods */}
                    <PosPanel className="min-h-0">
                      <PosPanelHeader
                        eyebrow="Composition"
                        title="Payment methods"
                        description="How customers paid this week."
                      />
                      <AdminDonutChart
                        rows={weekMetrics.paymentRows}
                        height={260}
                        valueLabel="Total"
                        valueFormatter={(v) => money(v)}
                        emptyLabel="No payment data"
                      />
                    </PosPanel>

                    {/* Top items */}
                    <PosPanel className="min-h-0">
                      <PosPanelHeader
                        eyebrow="Products"
                        title="Top selling items"
                        description="Highest revenue items this week."
                      />
                      <AdminDistributionChart
                        rows={weekMetrics.topItemRows}
                        height={260}
                        valueLabel="Revenue"
                        valueFormatter={(v) => money(v)}
                        emptyLabel="No item data"
                      />
                    </PosPanel>
                  </div>
                </>
              )}
            </>
          )
        )}
      </div>
    </div>
  );
}
