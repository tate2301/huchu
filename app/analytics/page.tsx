"use client"

import { useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select } from "@/components/ui/select"
import { ArrowLeft, TrendingDown, Clock, Zap } from "lucide-react"

// Mock data for demonstration
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
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-indigo-600 text-white shadow-lg">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Link href="/">
              <Button variant="ghost" className="text-white hover:bg-indigo-700 p-2">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-xl md:text-2xl font-bold">Downtime Analytics</h1>
              <p className="text-indigo-100 text-sm">Phase 2: Top causes by site</p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6 max-w-6xl">
        {/* Filters */}
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Site</label>
                <Select 
                  value={selectedSite}
                  onChange={(e) => setSelectedSite(e.target.value)}
                >
                  {sites.map(site => (
                    <option key={site.id} value={site.id}>{site.name}</option>
                  ))}
                </Select>
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-2">Time Range</label>
                <Select 
                  value={timeRange}
                  onChange={(e) => setTimeRange(e.target.value)}
                >
                  <option value="week">This Week</option>
                  <option value="month">This Month</option>
                  <option value="quarter">This Quarter</option>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Summary Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Total Downtime
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{totalHours.toFixed(1)}h</div>
              <p className="text-xs text-gray-500 mt-1">This {timeRange}</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
                <TrendingDown className="h-4 w-4" />
                Top Cause
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-lg font-bold">{currentData[0]?.reason}</div>
              <p className="text-xs text-gray-500 mt-1">{currentData[0]?.hours.toFixed(1)}h ({currentData[0]?.percentage}%)</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
                <Zap className="h-4 w-4" />
                Incidents
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{currentData.length}</div>
              <p className="text-xs text-gray-500 mt-1">Different causes</p>
            </CardContent>
          </Card>
        </div>

        {/* Top Causes Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Top Downtime Causes</CardTitle>
            <CardDescription>
              Ranked by total hours lost this {timeRange}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {currentData.map((item, index) => (
                <div key={index} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 flex-1">
                      <span className="text-2xl font-bold text-gray-300">
                        {index + 1}
                      </span>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-medium">{item.reason}</span>
                          <div className="flex items-center gap-3">
                            <span className="text-sm text-gray-600">
                              {item.hours.toFixed(1)}h
                            </span>
                            <span className="text-sm font-medium text-gray-900">
                              {item.percentage}%
                            </span>
                          </div>
                        </div>
                        
                        {/* Progress Bar */}
                        <div className="w-full bg-gray-200 rounded-full h-3">
                          <div 
                            className={`h-3 rounded-full ${
                              index === 0 ? 'bg-red-500' :
                              index === 1 ? 'bg-orange-500' :
                              index === 2 ? 'bg-yellow-500' :
                              'bg-blue-500'
                            }`}
                            style={{ width: `${item.percentage}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Action Items */}
            <div className="mt-6 pt-6 border-t">
              <h4 className="font-medium mb-3">Recommendations</h4>
              <ul className="space-y-2 text-sm text-gray-600">
                <li className="flex items-start gap-2">
                  <span className="text-orange-600">•</span>
                  <span>Priority 1: Address {currentData[0]?.reason.toLowerCase()} - causing {currentData[0]?.percentage}% of downtime</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-orange-600">•</span>
                  <span>Monitor {currentData[1]?.reason.toLowerCase()} - second highest impact</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-600">•</span>
                  <span>Total potential recovery: {totalHours.toFixed(1)} hours with proper mitigation</span>
                </li>
              </ul>
            </div>
          </CardContent>
        </Card>

        {/* Weekly Trend Placeholder */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Downtime Trend</CardTitle>
            <CardDescription>Coming soon: Historical trend chart</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64 bg-gray-100 rounded-lg flex items-center justify-center text-gray-500">
              <div className="text-center">
                <TrendingDown className="h-12 w-12 mx-auto mb-2 text-gray-400" />
                <p className="text-sm">Chart visualization under development</p>
                <p className="text-xs mt-1">Will show daily downtime trends</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Export Actions */}
        <div className="flex gap-3 mt-6">
          <Button variant="outline" className="flex-1">
            Export PDF Report
          </Button>
          <Button variant="outline" className="flex-1">
            Export CSV Data
          </Button>
        </div>
      </main>
    </div>
  )
}
