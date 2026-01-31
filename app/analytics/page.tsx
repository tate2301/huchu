"use client"

import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import {
  endOfMonth,
  endOfQuarter,
  endOfWeek,
  startOfMonth,
  startOfQuarter,
  startOfWeek,
} from "date-fns"
import { Clock, TrendingDown, Zap } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { PageHeading } from "@/components/layout/page-heading"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
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

export default function AnalyticsPage() {
  const [selectedSite, setSelectedSite] = useState("")
  const [timeRange, setTimeRange] = useState<TimeRangeKey>("week")

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

  const causes = analytics?.causes ?? []

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <PageHeading title="Downtime Analytics" description="Phase 2: Top causes by site" />

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
              <label className="block text-sm font-semibold mb-2">Site</label>
              {sitesLoading ? (
                <Skeleton className="h-9 w-full" />
              ) : (
                <Select value={activeSiteId} onValueChange={setSelectedSite}>
                  <SelectTrigger className="w-full">
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
              <label className="block text-sm font-semibold mb-2">Time Range</label>
              <Select value={timeRange} onValueChange={(value) => setTimeRange(value as TimeRangeKey)}>
                <SelectTrigger className="w-full">
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
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Total Downtime
            </CardTitle>
          </CardHeader>
          <CardContent>
            {analyticsLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <div className="text-3xl font-bold">{totalHours.toFixed(1)}h</div>
            )}
            <p className="text-xs text-muted-foreground mt-1">{timeRanges[timeRange]}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
              <TrendingDown className="h-4 w-4" />
              Top Cause
            </CardTitle>
          </CardHeader>
          <CardContent>
            {analyticsLoading ? (
              <Skeleton className="h-6 w-40" />
            ) : analytics?.topCause ? (
              <>
                <div className="text-lg font-semibold">{analytics.topCause.description}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {analytics.topCause.hours.toFixed(1)}h
                </p>
              </>
            ) : (
              <div className="text-sm text-muted-foreground">No downtime recorded</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
              <Zap className="h-4 w-4" />
              Availability
            </CardTitle>
          </CardHeader>
          <CardContent>
            {analyticsLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <div className="text-3xl font-bold">{availability}%</div>
            )}
            <p className="text-xs text-muted-foreground mt-1">Estimated uptime</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Downtime Breakdown</CardTitle>
          <CardDescription>Hours lost by cause</CardDescription>
        </CardHeader>
        <CardContent>
          {analyticsLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-4 w-4/5" />
              <Skeleton className="h-4 w-3/5" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          ) : causes.length === 0 ? (
            <div className="text-sm text-muted-foreground">No downtime data for this range.</div>
          ) : (
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
          )}
        </CardContent>
      </Card>
    </div>
  )
}
