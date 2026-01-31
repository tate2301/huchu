"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Server, CheckCircle, XCircle, Clock } from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { fetchNVRs, Site } from "@/lib/api"

interface NVRsViewProps {
  sites: Site[]
  selectedSiteId: string
  onSiteChange: (siteId: string) => void
}

export function NVRsView({ sites, selectedSiteId, onSiteChange }: NVRsViewProps) {
  const [statusFilter, setStatusFilter] = useState<string>("")

  const { data, isLoading, error } = useQuery({
    queryKey: ["nvrs", selectedSiteId, statusFilter],
    queryFn: () =>
      fetchNVRs({
        siteId: selectedSiteId || undefined,
        isOnline: statusFilter === "online" ? true : statusFilter === "offline" ? false : undefined,
      }),
  })

  const nvrs = data?.data || []

  if (error) {
    return (
      <Card>
        <CardContent className="py-8">
          <p className="text-center text-red-600">Error loading NVRs: {error.message}</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-4">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium">Site:</label>
              <Select value={selectedSiteId} onValueChange={onSiteChange}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="All Sites" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All Sites</SelectItem>
                  {sites.map((site) => (
                    <SelectItem key={site.id} value={site.id}>
                      {site.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-sm font-medium">Status:</label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="All Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All Status</SelectItem>
                  <SelectItem value="online">Online</SelectItem>
                  <SelectItem value="offline">Offline</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {(selectedSiteId || statusFilter) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  onSiteChange("")
                  setStatusFilter("")
                }}
              >
                Clear Filters
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* NVRs Grid */}
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2 mt-2" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-20 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : nvrs.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <Server className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-sm text-muted-foreground">
              No NVRs found. Add an NVR to start managing cameras.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {nvrs.map((nvr) => (
            <Card key={nvr.id} className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-base">{nvr.name}</CardTitle>
                    <CardDescription className="mt-1">
                      {nvr.manufacturer}
                      {nvr.model && ` • ${nvr.model}`}
                    </CardDescription>
                  </div>
                  <Badge 
                    variant={nvr.isOnline ? "outline" : "destructive"}
                    className="ml-2"
                  >
                    {nvr.isOnline ? (
                      <CheckCircle className="mr-1 h-3 w-3" />
                    ) : (
                      <XCircle className="mr-1 h-3 w-3" />
                    )}
                    {nvr.isOnline ? "Online" : "Offline"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Site:</span>
                    <span className="font-medium">{nvr.site?.name || "Unknown"}</span>
                  </div>

                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">IP Address:</span>
                    <span className="font-mono font-medium text-xs">{nvr.ipAddress}</span>
                  </div>

                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">RTSP Port:</span>
                    <span className="font-mono font-medium text-xs">{nvr.port}</span>
                  </div>

                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">HTTP Port:</span>
                    <span className="font-mono font-medium text-xs">{nvr.httpPort}</span>
                  </div>

                  {nvr._count && (
                    <div className="flex items-center justify-between text-sm pt-2 border-t">
                      <span className="text-muted-foreground">Cameras:</span>
                      <Badge variant="secondary" className="text-xs">
                        {nvr._count.cameras} configured
                      </Badge>
                    </div>
                  )}

                  {nvr.lastHeartbeat && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground pt-2">
                      <Clock className="h-3 w-3" />
                      <span>Last seen: {new Date(nvr.lastHeartbeat).toLocaleString()}</span>
                    </div>
                  )}

                  {nvr.model && (
                    <div className="pt-2 border-t">
                      <p className="text-xs text-muted-foreground">
                        Model: {nvr.model}
                      </p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
