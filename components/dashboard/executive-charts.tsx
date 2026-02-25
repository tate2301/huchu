"use client";

import { AxisChart } from "@rtcamp/frappe-ui-react";

import type { ExecutiveCharts as ExecutiveChartsData } from "@/lib/api";
import { FrappeChartShell } from "@/components/charts/frappe-chart-shell";
import { StatusState } from "@/components/shared/status-state";
import { Skeleton } from "@/components/ui/skeleton";
import {
  buildAxisChartConfig,
  buildTimeSeriesChartConfig,
} from "@/lib/charts/frappe-config-builders";

type ExecutiveChartsProps = {
  data?: ExecutiveChartsData;
  isLoading?: boolean;
  isError?: boolean;
  errorMessage?: string;
};

export function ExecutiveCharts({
  data,
  isLoading,
  isError,
  errorMessage,
}: ExecutiveChartsProps) {
  const goldTrend = data?.goldTrend ?? [];
  const cashTrend = data?.cashTrend ?? [];
  const throughputTrend = data?.throughputTrend ?? [];
  const riskBreakdown = data?.riskBreakdown ?? [];

  const goldChartData = goldTrend.map((item) => ({
    date: item.date,
    gold: item.value,
    prev_avg: item.comparison ?? null,
  }));
  const goldChartConfig = buildTimeSeriesChartConfig({
    data: goldChartData,
    title: "Gold Over Time",
    subtitle: "Produced gold weight trend (grams).",
    colors: ["hsl(var(--primary))", "hsl(var(--muted-foreground))"],
    xAxisKey: "date",
    yAxisTitle: "Gold (g)",
    series: [
      { name: "gold", type: "line", lineWidth: 2.1 },
      { name: "prev_avg", type: "line", lineType: "dashed", lineWidth: 1.8 },
    ],
  });

  const cashChartData = cashTrend.map((item) => ({
    date: item.date,
    inflow: item.inflow,
    outflow: item.outflow,
    net: item.net,
  }));
  const cashChartConfig = buildTimeSeriesChartConfig({
    data: cashChartData,
    title: "Cash Flow Trend",
    subtitle: "Inflow vs outflow with net position by day.",
    colors: [
      "hsl(var(--chart-2))",
      "hsl(var(--chart-3))",
      "hsl(var(--primary))",
    ],
    xAxisKey: "date",
    yAxisTitle: "USD",
    series: [
      { name: "inflow", type: "bar" },
      { name: "outflow", type: "bar" },
      { name: "net", type: "line", lineWidth: 2 },
    ],
  });

  const throughputChartData = throughputTrend.map((item) => ({
    date: item.date,
    throughput: item.value,
    prev_avg: item.comparison ?? null,
  }));
  const throughputChartConfig = buildTimeSeriesChartConfig({
    data: throughputChartData,
    title: "Throughput Trend",
    subtitle: "Daily plant throughput in tonnes.",
    colors: ["hsl(var(--chart-1))", "hsl(var(--muted-foreground))"],
    xAxisKey: "date",
    yAxisTitle: "Tonnes",
    series: [
      { name: "throughput", type: "line", lineWidth: 2.1 },
      { name: "prev_avg", type: "line", lineType: "dashed", lineWidth: 1.8 },
    ],
  });

  const riskChartData = riskBreakdown.map((item) => ({
    label: item.label,
    open_items: item.value,
  }));
  const riskChartConfig = buildAxisChartConfig({
    data: riskChartData,
    title: "Risk Composition",
    subtitle: "Open risk distribution by module domain.",
    colors: ["hsl(var(--chart-4))"],
    xAxisKey: "label",
    xAxisType: "category",
    yAxisTitle: "Open Items",
    series: [{ name: "open_items", type: "bar" }],
  });

  const hasAnyData =
    goldTrend.length > 0 ||
    cashTrend.length > 0 ||
    throughputTrend.length > 0 ||
    riskBreakdown.length > 0;

  return (
    <section className="space-y-2">
      <div className="space-y-0.5">
        <h3 className="text-base font-semibold tracking-tight">Performance Trends</h3>
        <p className="text-sm text-muted-foreground">
          Gold, cash, throughput, and risk series for the selected range.
        </p>
      </div>
      {isLoading ? (
        <div className="grid gap-3 lg:grid-cols-2">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : null}

      {!isLoading && isError ? (
        <StatusState
          variant="error"
          title="Trend charts unavailable"
          description={errorMessage || "Chart data could not be retrieved."}
        />
      ) : null}

      {!isLoading && !isError && !hasAnyData ? (
        <StatusState
          variant="empty"
          title="No trend data available"
          description="No trendlines or risk distribution records were returned."
        />
      ) : null}

      {!isLoading && !isError && hasAnyData ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {goldTrend.length === 0 ? (
            <div className="rounded-md border border-border/60 bg-card/50 p-4 text-sm text-muted-foreground">
              Gold trend is unavailable for this selection.
            </div>
          ) : (
            <FrappeChartShell>
              <AxisChart config={goldChartConfig} />
            </FrappeChartShell>
          )}

          {cashTrend.length === 0 ? (
            <div className="rounded-md border border-border/60 bg-card/50 p-4 text-sm text-muted-foreground">
              Cash trend is unavailable for this selection.
            </div>
          ) : (
            <FrappeChartShell>
              <AxisChart config={cashChartConfig} />
            </FrappeChartShell>
          )}

          {throughputTrend.length === 0 ? (
            <div className="rounded-md border border-border/60 bg-card/50 p-4 text-sm text-muted-foreground">
              Throughput trend is unavailable for this selection.
            </div>
          ) : (
            <FrappeChartShell>
              <AxisChart config={throughputChartConfig} />
            </FrappeChartShell>
          )}

          {riskBreakdown.length === 0 ? (
            <div className="rounded-md border border-border/60 bg-card/50 p-4 text-sm text-muted-foreground">
              Risk breakdown is unavailable for this selection.
            </div>
          ) : (
            <FrappeChartShell>
              <AxisChart config={riskChartConfig} />
            </FrappeChartShell>
          )}
        </div>
      ) : null}
    </section>
  );
}
