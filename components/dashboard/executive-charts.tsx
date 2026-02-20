"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { ExecutiveCharts as ExecutiveChartsData } from "@/lib/api";
import { StatusState } from "@/components/shared/status-state";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

type ExecutiveChartsProps = {
  data?: ExecutiveChartsData;
  isLoading?: boolean;
  isError?: boolean;
  errorMessage?: string;
};

const compactNumber = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

const fullNumber = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
});

const chartTooltipContentStyle = {
  borderRadius: "12px",
  border: "1px solid hsl(var(--border))",
  backgroundColor: "hsl(var(--popover))",
  boxShadow: "var(--elevation-2)",
};

const chartTooltipLabelStyle = {
  color: "hsl(var(--foreground))",
  fontWeight: 600,
  marginBottom: 6,
};

const chartAxisTick = {
  fontSize: 11,
  fill: "hsl(var(--muted-foreground))",
};

function SeriesIndicator({ label, colorClassName }: { label: string; colorClassName: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md bg-background/80 px-2 py-1 text-[11px] text-muted-foreground shadow-[var(--edge-outline-sharp)]">
      <span className={`h-2 w-2 rounded-full ${colorClassName}`} />
      {label}
    </span>
  );
}

function formatDateLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

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
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Gold Over Time</CardTitle>
              <CardDescription className="text-xs">Produced gold weight trend (grams).</CardDescription>
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <SeriesIndicator label="Gold" colorClassName="bg-[hsl(var(--primary))]" />
                <SeriesIndicator label="Prev Avg" colorClassName="bg-[hsl(var(--muted-foreground))]" />
              </div>
            </CardHeader>
            <CardContent>
              {goldTrend.length === 0 ? (
                <p className="text-sm text-muted-foreground">Gold trend is unavailable for this selection.</p>
              ) : (
                <div className="h-56 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={goldTrend} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid stroke="hsl(var(--border))" strokeOpacity={0.45} strokeDasharray="2 6" />
                      <XAxis
                        dataKey="date"
                        tickFormatter={formatDateLabel}
                        tick={chartAxisTick}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        tickFormatter={(value) => compactNumber.format(Number(value))}
                        tick={chartAxisTick}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        labelFormatter={(label) => formatDateLabel(String(label))}
                        formatter={(value, name) => [
                          `${fullNumber.format(Number(value))} g`,
                          name === "comparison" ? "Prev Avg" : "Gold",
                        ]}
                        contentStyle={chartTooltipContentStyle}
                        labelStyle={chartTooltipLabelStyle}
                      />
                      <Line type="monotone" dataKey="value" stroke="hsl(var(--primary))" dot={false} strokeWidth={2.1} />
                      <Line
                        type="monotone"
                        dataKey="comparison"
                        stroke="hsl(var(--muted-foreground))"
                        strokeDasharray="4 4"
                        strokeOpacity={0.75}
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Cash Flow Trend</CardTitle>
              <CardDescription className="text-xs">Inflow vs outflow with net position by day.</CardDescription>
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <SeriesIndicator label="Inflow" colorClassName="bg-[hsl(var(--chart-2))]" />
                <SeriesIndicator label="Outflow" colorClassName="bg-[hsl(var(--chart-3))]" />
                <SeriesIndicator label="Net" colorClassName="bg-[hsl(var(--primary))]" />
              </div>
            </CardHeader>
            <CardContent>
              {cashTrend.length === 0 ? (
                <p className="text-sm text-muted-foreground">Cash trend is unavailable for this selection.</p>
              ) : (
                <div className="h-56 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={cashTrend} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid stroke="hsl(var(--border))" strokeOpacity={0.45} strokeDasharray="2 6" />
                      <XAxis
                        dataKey="date"
                        tickFormatter={formatDateLabel}
                        tick={chartAxisTick}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        tickFormatter={(value) => compactNumber.format(Number(value))}
                        tick={chartAxisTick}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        labelFormatter={(label) => formatDateLabel(String(label))}
                        formatter={(value, name) => {
                          const label =
                            name === "inflow"
                              ? "Inflow"
                              : name === "outflow"
                                ? "Outflow"
                                : "Net";
                          return [`USD ${fullNumber.format(Number(value))}`, label];
                        }}
                        contentStyle={chartTooltipContentStyle}
                        labelStyle={chartTooltipLabelStyle}
                      />
                      <Bar dataKey="inflow" fill="hsl(var(--chart-2))" fillOpacity={0.8} radius={[5, 5, 0, 0]} />
                      <Bar dataKey="outflow" fill="hsl(var(--chart-3))" fillOpacity={0.75} radius={[5, 5, 0, 0]} />
                      <Line type="monotone" dataKey="net" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Throughput Trend</CardTitle>
              <CardDescription className="text-xs">Daily plant throughput in tonnes.</CardDescription>
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <SeriesIndicator label="Throughput" colorClassName="bg-[hsl(var(--chart-1))]" />
                <SeriesIndicator label="Prev Avg" colorClassName="bg-[hsl(var(--muted-foreground))]" />
              </div>
            </CardHeader>
            <CardContent>
              {throughputTrend.length === 0 ? (
                <p className="text-sm text-muted-foreground">Throughput trend is unavailable for this selection.</p>
              ) : (
                <div className="h-56 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={throughputTrend} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid stroke="hsl(var(--border))" strokeOpacity={0.45} strokeDasharray="2 6" />
                      <XAxis
                        dataKey="date"
                        tickFormatter={formatDateLabel}
                        tick={chartAxisTick}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        tickFormatter={(value) => compactNumber.format(Number(value))}
                        tick={chartAxisTick}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        labelFormatter={(label) => formatDateLabel(String(label))}
                        formatter={(value, name) => [
                          `${fullNumber.format(Number(value))} t`,
                          name === "comparison" ? "Prev Avg" : "Throughput",
                        ]}
                        contentStyle={chartTooltipContentStyle}
                        labelStyle={chartTooltipLabelStyle}
                      />
                      <Line type="monotone" dataKey="value" stroke="hsl(var(--chart-1))" strokeWidth={2.1} dot={false} />
                      <Line
                        type="monotone"
                        dataKey="comparison"
                        stroke="hsl(var(--muted-foreground))"
                        strokeDasharray="4 4"
                        strokeOpacity={0.75}
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Risk Composition</CardTitle>
              <CardDescription className="text-xs">Open risk distribution by module domain.</CardDescription>
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <SeriesIndicator label="Open Items" colorClassName="bg-[hsl(var(--chart-4))]" />
              </div>
            </CardHeader>
            <CardContent>
              {riskBreakdown.length === 0 ? (
                <p className="text-sm text-muted-foreground">Risk breakdown is unavailable for this selection.</p>
              ) : (
                <div className="h-56 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={riskBreakdown} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid stroke="hsl(var(--border))" strokeOpacity={0.45} strokeDasharray="2 6" />
                      <XAxis dataKey="label" tick={chartAxisTick} axisLine={false} tickLine={false} />
                      <YAxis
                        tickFormatter={(value) => compactNumber.format(Number(value))}
                        tick={chartAxisTick}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        formatter={(value) => [fullNumber.format(Number(value)), "Open items"]}
                        contentStyle={chartTooltipContentStyle}
                        labelStyle={chartTooltipLabelStyle}
                      />
                      <Bar dataKey="value" fill="hsl(var(--chart-4))" fillOpacity={0.8} radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      ) : null}
    </section>
  );
}
