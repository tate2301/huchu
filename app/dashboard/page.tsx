"use client"

import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { AxisChart, NumberChart } from "@rtcamp/frappe-ui-react"
import { endOfMonth, endOfQuarter, endOfWeek, format, startOfMonth, startOfQuarter, startOfWeek } from "date-fns"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { FrappeChartShell } from "@/components/charts/frappe-chart-shell"
import { PageHeading } from "@/components/layout/page-heading"
import { StatusState } from "@/components/shared/status-state"
import { Card, CardContent } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import {
  buildNumberMetricConfig,
  buildTimeSeriesChartConfig,
} from "@/lib/charts/frappe-config-builders"
import { fetchPlantReports, fetchSites } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-client"

const timeRanges = {
  week: "This Week",
  month: "This Month",
  quarter: "This Quarter",
}

type TimeRangeKey = keyof typeof timeRanges

function getDateRange(range: TimeRangeKey) {
  const now = new Date()
  if (range === "month") {
    return { start: startOfMonth(now), end: endOfMonth(now) }
  }
  if (range === "quarter") {
    return { start: startOfQuarter(now), end: endOfQuarter(now) }
  }
  return { start: startOfWeek(now, { weekStartsOn: 1 }), end: endOfWeek(now, { weekStartsOn: 1 }) }
}

function MetricTile({
  title,
  value,
  valueLabel,
  detail,
  negativeIsBetter = false,
}: {
  title: string
  value: number
  valueLabel: string
  detail: string
  negativeIsBetter?: boolean
}) {
  const metricConfig = buildNumberMetricConfig({
    title,
    value,
    negativeIsBetter,
  })

  return (
    <div className="rounded-md border border-border/60 bg-card/70">
      <NumberChart
        config={metricConfig}
        subtitle={() => (
          <div className="flex flex-col gap-1">
            <div className="font-mono text-[24px] font-semibold leading-8 text-ink-gray-6 tabular-nums">
              {valueLabel}
            </div>
            <div className="text-xs text-muted-foreground">{detail}</div>
          </div>
        )}
      />
    </div>
  )
}

export default function DashboardPage() {
  const [selectedSite, setSelectedSite] = useState("all")
  const [timeRange, setTimeRange] = useState<TimeRangeKey>("week")
  const siteFilterId = "dashboard-site-filter"
  const timeRangeFilterId = "dashboard-time-range-filter"

  const { data: sites, isLoading: sitesLoading, error: sitesError } = useQuery({
    queryKey: ["sites"],
    queryFn: fetchSites,
  })

  const { startDate, endDate } = useMemo(() => {
    const range = getDateRange(timeRange)
    return {
      startDate: range.start.toISOString(),
      endDate: range.end.toISOString(),
    }
  }, [timeRange])

  const activeSiteId = selectedSite === "all" ? "" : selectedSite
  const canFetch = selectedSite === "all" || !!activeSiteId

  const {
    data: plantReports,
    isLoading: reportsLoading,
    error: reportsError,
  } = useQuery({
    queryKey: ["plant-reports", activeSiteId || "all", timeRange],
    queryFn: () =>
      fetchPlantReports({
        siteId: activeSiteId || undefined,
        startDate,
        endDate,
        limit: 200,
      }),
    enabled: canFetch,
  })

  const reports = useMemo(() => plantReports?.data ?? [], [plantReports?.data])

  const summary = useMemo(() => {
    return reports.reduce(
      (acc, report) => {
        acc.tonnesProcessed += report.tonnesProcessed ?? 0
        acc.tonnesFed += report.tonnesFed ?? 0
        acc.goldRecovered += report.goldRecovered ?? 0
        acc.runHours += report.runHours ?? 0
        acc.dieselUsed += report.dieselUsed ?? 0
        acc.reportCount += 1
        return acc
      },
      {
        tonnesProcessed: 0,
        tonnesFed: 0,
        goldRecovered: 0,
        runHours: 0,
        dieselUsed: 0,
        reportCount: 0,
      }
    )
  }, [reports])

  const series = useMemo(() => {
    const byDate = new Map<
      string,
      { date: string; tonnesProcessed: number; goldRecovered: number; runHours: number }
    >()
    reports.forEach((report) => {
      const key = format(new Date(report.date), "yyyy-MM-dd")
      const existing = byDate.get(key) ?? {
        date: key,
        tonnesProcessed: 0,
        goldRecovered: 0,
        runHours: 0,
      }
      existing.tonnesProcessed += report.tonnesProcessed ?? 0
      existing.goldRecovered += report.goldRecovered ?? 0
      existing.runHours += report.runHours ?? 0
      byDate.set(key, existing)
    })
    return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date))
  }, [reports])

  const averageRunHours = summary.reportCount ? summary.runHours / summary.reportCount : 0

  const tonnesChartConfig = buildTimeSeriesChartConfig({
    data: series,
    title: "Tonnes Processed",
    subtitle: "Daily production totals",
    colors: ["hsl(var(--primary))"],
    xAxisKey: "date",
    yAxisTitle: "Tonnes",
    series: [{ name: "tonnesProcessed", type: "line", lineWidth: 2 }],
  })

  const goldChartConfig = buildTimeSeriesChartConfig({
    data: series,
    title: "Gold Recovery",
    subtitle: "Daily recovered grams",
    colors: ["hsl(var(--primary))"],
    xAxisKey: "date",
    yAxisTitle: "Grams",
    series: [{ name: "goldRecovered", type: "bar" }],
  })

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <PageHeading title="Production Dashboard" description="Production trends across sites" />

      {(sitesError || reportsError) && (
        <Alert variant="destructive">
          <AlertTitle>Unable to load production data</AlertTitle>
          <AlertDescription>
            {getApiErrorMessage(sitesError || reportsError)}
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent className="pt-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="block text-sm font-semibold mb-2" htmlFor={siteFilterId}>
                Site
              </label>
              {sitesLoading ? (
                <Skeleton className="h-9 w-full" />
              ) : (
                <Select value={selectedSite} onValueChange={setSelectedSite}>
                  <SelectTrigger id={siteFilterId} className="w-full">
                    <SelectValue placeholder="Select site" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All sites</SelectItem>
                    {sites?.length ? (
                      sites.map((site) => (
                        <SelectItem key={site.id} value={site.id}>
                          {site.name}
                        </SelectItem>
                      ))
                    ) : (
                      <SelectItem value="no-sites" disabled>
                        No sites available
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div>
              <label className="block text-sm font-semibold mb-2" htmlFor={timeRangeFilterId}>
                Time Range
              </label>
              <Select value={timeRange} onValueChange={(value) => setTimeRange(value as TimeRangeKey)}>
                <SelectTrigger id={timeRangeFilterId} className="w-full">
                  <SelectValue placeholder="Select time range" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(timeRanges).map(([key, label]) => (
                    <SelectItem key={key} value={key}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {!reportsLoading && reports.length === 0 ? (
        <StatusState
          variant="empty"
          title="No production data in this range"
          description="Try a different site or time range to load dashboard metrics."
        />
      ) : null}

      {!reportsLoading && reports.length > 0 ? (
        <Alert variant="success">
          <AlertTitle>Dashboard data ready</AlertTitle>
          <AlertDescription>
            Loaded {reports.length} plant report{reports.length === 1 ? "" : "s"} for the current filters.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {reportsLoading ? (
          Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={`production-metric-skeleton-${index}`} className="h-[140px] w-full" />
          ))
        ) : (
          <>
            <MetricTile
              title="Tonnes Processed"
              value={summary.tonnesProcessed}
              valueLabel={summary.tonnesProcessed.toFixed(1)}
              detail={timeRanges[timeRange]}
            />
            <MetricTile
              title="Gold Recovered"
              value={summary.goldRecovered}
              valueLabel={`${summary.goldRecovered.toFixed(2)} g`}
              detail="Plant reports"
            />
            <MetricTile
              title="Average Run Hours"
              value={averageRunHours}
              valueLabel={`${averageRunHours.toFixed(1)}h`}
              detail="Per report"
            />
            <MetricTile
              title="Diesel Used"
              value={summary.dieselUsed}
              valueLabel={`${summary.dieselUsed.toFixed(1)} L`}
              detail="Consumables"
            />
          </>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {reportsLoading ? (
          <>
            <Skeleton className="h-[340px] w-full" />
            <Skeleton className="h-[340px] w-full" />
          </>
        ) : series.length === 0 ? (
          <div className="col-span-full text-sm text-muted-foreground">No plant reports in this range.</div>
        ) : (
          <>
            <FrappeChartShell>
              <AxisChart config={tonnesChartConfig} />
            </FrappeChartShell>
            <FrappeChartShell>
              <AxisChart config={goldChartConfig} />
            </FrappeChartShell>
          </>
        )}
      </div>
    </div>
  )
}

