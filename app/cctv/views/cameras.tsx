"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Camera as CameraIcon, CheckCircle, XCircle, Shield, Radio, Mic } from "lucide-react"

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
import { fetchCameras, Site } from "@/lib/api"

interface CamerasViewProps {
  sites: Site[]
  selectedSiteId: string
  onSiteChange: (siteId: string) => void
}

export function CamerasView({ sites, selectedSiteId, onSiteChange }: CamerasViewProps) {
  const [areaFilter, setAreaFilter] = useState<string>("")
  const [statusFilter, setStatusFilter] = useState<string>("")

  const { data, isLoading, error } = useQuery({
    queryKey: ["cameras", selectedSiteId, areaFilter, statusFilter],
    queryFn: () =>
      fetchCameras({
        siteId: selectedSiteId || undefined,
        area: areaFilter || undefined,
        isOnline: statusFilter === "online" ? true : statusFilter === "offline" ? false : undefined,
        limit: 100,
      }),
  })

  const cameras = data?.data || []

  // Get unique areas for filtering
  const areas = Array.from(new Set(cameras.map(c => c.area))).sort()

  if (error) {
    return (
      <Card>
        <CardContent className="py-8">
          <p className="text-center text-red-600">Error loading cameras: {error.message}</p>
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
              <label className="text-sm font-medium">Area:</label>
              <Select value={areaFilter} onValueChange={setAreaFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="All Areas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All Areas</SelectItem>
                  {areas.map((area) => (
                    <SelectItem key={area} value={area}>
                      {area}
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

            {(selectedSiteId || areaFilter || statusFilter) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  onSiteChange("")
                  setAreaFilter("")
                  setStatusFilter("")
                }}
              >
                Clear Filters
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Cameras Grid */}
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
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
      ) : cameras.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <CameraIcon className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-sm text-muted-foreground">
              No cameras found. Add cameras to start monitoring.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {cameras.map((camera) => (
            <Card key={camera.id} className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-base flex items-center gap-2">
                      {camera.name}
                      {camera.isHighSecurity && (
                        <Shield className="h-4 w-4 text-orange-600" title="High Security" />
                      )}
                    </CardTitle>
                    <CardDescription className="mt-1">
                      Channel {camera.channelNumber} • {camera.area}
                    </CardDescription>
                  </div>
                  <Badge 
                    variant={camera.isOnline ? "outline" : "destructive"}
                    className="ml-2"
                  >
                    {camera.isOnline ? (
                      <CheckCircle className="mr-1 h-3 w-3" />
                    ) : (
                      <XCircle className="mr-1 h-3 w-3" />
                    )}
                    {camera.isOnline ? "Online" : "Offline"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Site:</span>
                    <span className="font-medium">{camera.site?.name || "Unknown"}</span>
                  </div>
                  
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">NVR:</span>
                    <span className="font-medium">{camera.nvr?.name || "Unknown"}</span>
                  </div>

                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Recording:</span>
                    <Badge variant={camera.isRecording ? "outline" : "secondary"} className="text-xs">
                      {camera.isRecording ? (
                        <>
                          <Radio className="mr-1 h-3 w-3 text-red-600" />
                          Active
                        </>
                      ) : (
                        "Inactive"
                      )}
                    </Badge>
                  </div>

                  {/* Capabilities */}
                  <div className="flex flex-wrap gap-1 pt-2 border-t">
                    {camera.hasPTZ && (
                      <Badge variant="secondary" className="text-xs">
                        PTZ
                      </Badge>
                    )}
                    {camera.hasAudio && (
                      <Badge variant="secondary" className="text-xs">
                        <Mic className="mr-1 h-3 w-3" />
                        Audio
                      </Badge>
                    )}
                    {camera.hasMotionDetect && (
                      <Badge variant="secondary" className="text-xs">
                        Motion
                      </Badge>
                    )}
                    {camera.hasLineDetect && (
                      <Badge variant="secondary" className="text-xs">
                        Line Cross
                      </Badge>
                    )}
                  </div>

                  {camera.description && (
                    <p className="text-xs text-muted-foreground pt-2 border-t">
                      {camera.description}
                    </p>
                  )}

                  {camera.lastSeen && (
                    <p className="text-xs text-muted-foreground">
                      Last seen: {new Date(camera.lastSeen).toLocaleString()}
                    </p>
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
