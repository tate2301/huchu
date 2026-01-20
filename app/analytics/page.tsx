"use client"

import { useState } from "react"
import { PageHeading } from "@/components/layout/page-heading"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { TrendingDown, Clock, Zap } from "lucide-react"

const mockDowntimeData = {
  site1: [
    { reason: "No power", hours: 8.5, percentage: 35, trend: "up" },
    { reason: "Equipment breakdown", hours: 6.2, percentage: 26, trend: "down" },
    { reason: "No water", hours: 4.8, percentage: 20, trend: "stable" },
    { reason: "No fuel/diesel", hours: 2.9, percentage: 12, trend: "up" },
    { reason: "No spares/parts", hours: 1.6, percentage: 7, trend: "down" },
  ],
  site2: [
    { reason: "Equipment breakdown", hours: 12.3, percentage: 42, trend: "up" },
    { reason: "No power", hours: 7.5, percentage: 26, trend: "stable" },
    { reason: "No grinding media", hours: 5.2, percentage: 18, trend: "down" },
    { reason: "No water", hours: 2.8, percentage: 10, trend: "stable" },
    { reason: "Weather/flooding", hours: 1.2, percentage: 4, trend: "down" },
  ],
  site3: [
    { reason: "No water", hours: 9.6, percentage: 38, trend: "up" },
    { reason: "Equipment breakdown", hours: 7.8, percentage: 31, trend: "stable" },
    { reason: "No power", hours: 4.5, percentage: 18, trend: "down" },
    { reason: "Labour shortage", hours: 2.1, percentage: 8, trend: "up" },
    { reason: "No reagents", hours: 1.3, percentage: 5, trend: "stable" },
  ],
}

const sites = [
  { id: "site1", name: "Mine Site 1" },
  { id: "site2", name: "Mine Site 2" },
  { id: "site3", name: "Mine Site 3" },
  { id: "site4", name: "Mine Site 4" },
  { id: "site5", name: "Mine Site 5" },
]

export default function AnalyticsPage() {
  const [selectedSite, setSelectedSite] = useState("site1")
  const [timeRange, setTimeRange] = useState("week")

  const currentData = mockDowntimeData[selectedSite as keyof typeof mockDowntimeData] || mockDowntimeData.site1
  const totalHours = currentData.reduce((sum, item) => sum + item.hours, 0)

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <PageHeading title="Downtime Analytics" description="Phase 2: Top causes by site" />

      <Card>
        <CardContent className="pt-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium mb-2">Site</label>
              <Select value={selectedSite} onValueChange={setSelectedSite}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select site" />
                </SelectTrigger>
                <SelectContent>
                  {sites.map((site) => (
                    <SelectItem key={site.id} value={site.id}>
                      {site.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Time Range</label>
              <Select value={timeRange} onValueChange={setTimeRange}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select time range" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="week">This Week</SelectItem>
                  <SelectItem value="month">This Month</SelectItem>
                  <SelectItem value="quarter">This Quarter</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Total Downtime
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{totalHours.toFixed(1)}h</div>
            <p className="text-xs text-muted-foreground mt-1">This {timeRange}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingDown className="h-4 w-4" />
              Top Cause
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-lg font-semibold">{currentData[0].reason}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {currentData[0].hours}h ({currentData[0].percentage}%)
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Zap className="h-4 w-4" />
              Availability
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {((1 - totalHours / (timeRange === "week" ? 168 : timeRange === "month" ? 720 : 2160)) * 100).toFixed(1)}%
            </div>
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
          <div className="space-y-4">
            {currentData.map((item, index) => (
              <div key={index} className="space-y-2">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{item.reason}</span>
                    {item.trend === "up" && <TrendingDown className="h-3 w-3 text-red-500 rotate-180" />}
                    {item.trend === "down" && <TrendingDown className="h-3 w-3 text-green-500" />}
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {item.hours}h ({item.percentage}%)
                  </span>
                </div>
                <div className="w-full bg-muted rounded-full h-2">
                  <div
                    className="bg-primary h-2 rounded-full"
                    style={{ width: `${item.percentage}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
