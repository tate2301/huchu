"use client"

import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { AxisChart, NumberChart } from "@rtcamp/frappe-ui-react"
import {
  endOfMonth,
  endOfQuarter,
  endOfWeek,
  startOfMonth,
  startOfQuarter,
  startOfWeek,
} from "date-fns"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { FrappeChartShell } from "@/components/charts/frappe-chart-shell"
import { Card, CardContent } from "@/components/ui/card"
import { PageHeading } from "@/components/layout/page-heading"
import { StatusState } from "@/components/shared/status-state"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import {
  buildAxisChartConfig,
  buildNumberMetricConfig,
} from "@/lib/charts/frappe-config-builders"
import { fetchDowntimeAnalytics, fetchSites } from "@/lib/api"
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

export default function AnalyticsPage() {
  const [selectedSite, setSelectedSite] = useState("")
  const [timeRange, setTimeRange] = useState<TimeRangeKey>("week")
  const siteFilterId = "analytics-site-filter"
  const timeRangeFilterId = "analytics-time-range-filter"

  const { data: sites, isLoading: sitesLoading, error: sitesError } = useQuery({
    queryKey: ["sites"],
    queryFn: fetchSites,
  })

  const activeSiteId = selectedSite || sites?.[0]?.id || ""

  const { startDate, endDate } = useMemo(() => {
    const range = getDateRange(timeRange)
    return {
      startDate: range.start.toISOString(),
      endDate: range.end.toISOString(),
    }
  }, [timeRange])

  const {
    data: analytics,
    isLoading: analyticsLoading,
    error: analyticsError,
  } = useQuery({
    queryKey: ["downtime-analytics", activeSiteId, timeRange],
    queryFn: () =>
      fetchDowntimeAnalytics({
        siteId: activeSiteId,
        startDate,
        endDate,
      }),
    enabled: !!activeSiteId,
  })

  const totalHours = analytics?.totalDowntimeHours ?? 0
  const totalPossibleHours = timeRange === "week" ? 168 : timeRange === "month" ? 720 : 2160
  const availability = totalPossibleHours
    ? ((1 - totalHours / totalPossibleHours) * 100).toFixed(1)
    : "100.0"

  const causes = useMemo(() => analytics?.causes ?? [], [analytics])
  const chartData = useMemo(
    () =>
      [...causes]
        .sort((a, b) => b.hours - a.hours)
        .slice(0, 8)
        .map((cause) => ({
          code: cause.code,
          description: cause.description,
          hours: Number(cause.hours.toFixed(2)),
          count: cause.count,
        })),
    [causes]
  )

  const chartDescriptionByCode = useMemo(() => {
    return new Map(chartData.map((item) => [item.code, item.description]))
  }, [chartData])

  const downtimeChartConfig = buildAxisChartConfig({
    data: chartData,
    title: "Downtime Breakdown",
    subtitle: "Hours lost by cause",
    colors: ["hsl(var(--primary))"],
    xAxisKey: "code",
    xAxisType: "category",
    yAxisTitle: "Hours",
    series: [{ name: "hours", type: "bar" }],
    echartOptions: {
      tooltip: {
        formatter: (params: unknown) => {
          const points = Array.isArray(params) ? params : [params]
          const first = points[0] as
            | {
                axisValue?: unknown
                name?: unknown
                value?: unknown
                data?: unknown
              }
            | undefined
          const code = first?.axisValue ?? first?.name
          const label = chartDescriptionByCode.get(String(code)) ?? String(code)
          const pointValue = first?.value
          const pointData = first?.data
          const value =
            (Array.isArray(pointValue) ? pointValue[1] : undefined) ??
            (Array.isArray(pointData) ? pointData[1] : undefined) ??
            (typeof pointValue === "number" ? pointValue : 0)
          return `<div>${label}<br/>Hours: <b>${Number(value).toFixed(1)}h</b></div>`
        },
      },
    },
  })

  return (
    <div className="w-full space-y-6">
      <PageHeading title="Downtime Analytics" description="Downtime causes, loss hours, and availability by site" />

      {(sitesError || analyticsError) && (
        <Alert variant="destructive">
          <AlertTitle>Unable to load analytics</AlertTitle>
          <AlertDescription>
            {getApiErrorMessage(sitesError || analyticsError)}
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
                <Select value={activeSiteId} onValueChange={setSelectedSite}>
                  <SelectTrigger id={siteFilterId} className="w-full">
                    <SelectValue placeholder="Select site" />
                  </SelectTrigger>
                  <SelectContent>
                    {sites?.map((site) => (
                      <SelectItem key={site.id} value={site.id}>
                        {site.name}
                      </SelectItem>
                    ))}
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

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {analyticsLoading ? (
          Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={`downtime-metric-skeleton-${index}`} className="h-[140px] w-full" />
          ))
        ) : (
          <>
            <MetricTile
              title="Total Downtime"
              value={totalHours}
              valueLabel={`${totalHours.toFixed(1)}h`}
              detail={timeRanges[timeRange]}
              negativeIsBetter
            />
            <MetricTile
              title="Top Cause"
              value={analytics?.topCause?.hours ?? 0}
              valueLabel={analytics?.topCause ? `${analytics.topCause.hours.toFixed(1)}h` : "No data"}
              detail={analytics?.topCause?.description ?? "No downtime recorded"}
              negativeIsBetter
            />
            <MetricTile
              title="Availability"
              value={Number(availability)}
              valueLabel={`${availability}%`}
              detail="Estimated uptime"
            />
          </>
        )}
      </div>

      <div className="rounded-md border border-border/60 bg-card/70 p-3">
        {analyticsLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-4 w-3/5" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        ) : causes.length === 0 ? (
          <div className="text-sm text-muted-foreground">No downtime data for this range.</div>
        ) : (
          <div className="space-y-6">
            <FrappeChartShell className="border-none bg-transparent p-0">
              <AxisChart config={downtimeChartConfig} />
            </FrappeChartShell>

            <div className="space-y-4">
              {causes.map((item) => {
                const percentage = totalHours ? (item.hours / totalHours) * 100 : 0
                return (
                  <div key={item.code} className="space-y-2">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{item.description}</span>
                      </div>
                      <span className="text-sm text-muted-foreground">
                        {item.hours.toFixed(1)}h ({percentage.toFixed(0)}%)
                      </span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2">
                      <div
                        className="bg-primary h-2 rounded-full"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {!analyticsLoading && !analytics ? (
        <StatusState
          variant="empty"
          title="No analytics available"
          description="Choose a site and time range to load downtime analytics."
        />
      ) : null}

      {!analyticsLoading && analytics && totalHours === 0 ? (
        <StatusState
          variant="success"
          title="No downtime recorded"
          description="No downtime incidents were found for the selected site and range."
        />
      ) : null}
    </div>
  )
}
