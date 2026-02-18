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
    <section className="space-y-3">
      <div className="space-y-1">
        <h3 className="text-lg font-semibold tracking-tight">Performance Trends</h3>
        <p className="text-sm text-muted-foreground">
          Gold, cash, throughput, and risk series for the selected range.
        </p>
      </div>
      {isLoading ? (
        <div className="grid gap-4 lg:grid-cols-2">
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
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Gold Over Time</CardTitle>
              <CardDescription>Produced gold weight trend (grams).</CardDescription>
            </CardHeader>
            <CardContent>
              {goldTrend.length === 0 ? (
                <p className="text-sm text-muted-foreground">Gold trend is unavailable for this selection.</p>
              ) : (
                <div className="h-56 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={goldTrend} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" tickFormatter={formatDateLabel} tick={{ fontSize: 12 }} />
                      <YAxis tickFormatter={(value) => compactNumber.format(Number(value))} />
                      <Tooltip
                        labelFormatter={(label) => formatDateLabel(String(label))}
                        formatter={(value, name) => [
                          `${fullNumber.format(Number(value))} g`,
                          name === "comparison" ? "Prev Avg" : "Gold",
                        ]}
                      />
                      <Line type="monotone" dataKey="value" stroke="hsl(var(--primary))" dot={false} strokeWidth={2.5} />
                      <Line
                        type="monotone"
                        dataKey="comparison"
                        stroke="hsl(var(--muted-foreground))"
                        strokeDasharray="5 4"
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
              <CardTitle className="text-base">Cash Flow Trend</CardTitle>
              <CardDescription>Inflow vs outflow with net position by day.</CardDescription>
            </CardHeader>
            <CardContent>
              {cashTrend.length === 0 ? (
                <p className="text-sm text-muted-foreground">Cash trend is unavailable for this selection.</p>
              ) : (
                <div className="h-56 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={cashTrend} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" tickFormatter={formatDateLabel} tick={{ fontSize: 12 }} />
                      <YAxis tickFormatter={(value) => compactNumber.format(Number(value))} />
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
                      />
                      <Bar dataKey="inflow" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="outflow" fill="hsl(var(--chart-3))" radius={[4, 4, 0, 0]} />
                      <Line type="monotone" dataKey="net" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Throughput Trend</CardTitle>
              <CardDescription>Daily plant throughput in tonnes.</CardDescription>
            </CardHeader>
            <CardContent>
              {throughputTrend.length === 0 ? (
                <p className="text-sm text-muted-foreground">Throughput trend is unavailable for this selection.</p>
              ) : (
                <div className="h-56 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={throughputTrend} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" tickFormatter={formatDateLabel} tick={{ fontSize: 12 }} />
                      <YAxis tickFormatter={(value) => compactNumber.format(Number(value))} />
                      <Tooltip
                        labelFormatter={(label) => formatDateLabel(String(label))}
                        formatter={(value, name) => [
                          `${fullNumber.format(Number(value))} t`,
                          name === "comparison" ? "Prev Avg" : "Throughput",
                        ]}
                      />
                      <Line type="monotone" dataKey="value" stroke="hsl(var(--chart-1))" strokeWidth={2.5} dot={false} />
                      <Line
                        type="monotone"
                        dataKey="comparison"
                        stroke="hsl(var(--muted-foreground))"
                        strokeDasharray="5 4"
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
              <CardTitle className="text-base">Risk Composition</CardTitle>
              <CardDescription>Open risk distribution by module domain.</CardDescription>
            </CardHeader>
            <CardContent>
              {riskBreakdown.length === 0 ? (
                <p className="text-sm text-muted-foreground">Risk breakdown is unavailable for this selection.</p>
              ) : (
                <div className="h-56 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={riskBreakdown} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                      <YAxis tickFormatter={(value) => compactNumber.format(Number(value))} />
                      <Tooltip formatter={(value) => [fullNumber.format(Number(value)), "Open items"]} />
                      <Bar dataKey="value" fill="hsl(var(--chart-4))" radius={[6, 6, 0, 0]} />
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
