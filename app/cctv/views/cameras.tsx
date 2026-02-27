"use client"

import Link from "next/link"
import { useRef, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  Camera as CameraIcon,
  CheckCircle,
  XCircle,
  Shield,
  Radio,
  Mic,
  Pencil,
  Trash2,
} from "@/lib/icons"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ExportMenu } from "@/components/ui/export-menu"
import { PdfTemplate } from "@/components/pdf/pdf-template"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { StatusState } from "@/components/shared/status-state"
import { PageIntro } from "@/components/shared/page-intro"
import { fetchCameras, Site } from "@/lib/api"
import { fetchJson, getApiErrorMessage } from "@/lib/api-client"
import { type DocumentExportFormat } from "@/lib/documents/export-client"
import { exportElementToDocument } from "@/lib/pdf"
import { useToast } from "@/components/ui/use-toast"

interface CamerasViewProps {
  sites: Site[]
  selectedSiteId: string
  onSiteChange: (siteId: string) => void
  createdId?: string | null
}

export function CamerasView({ sites, selectedSiteId, onSiteChange, createdId }: CamerasViewProps) {
  const camerasPdfRef = useRef<HTMLDivElement | null>(null)
  const [areaFilter, setAreaFilter] = useState<string>("")
  const [statusFilter, setStatusFilter] = useState<string>("")
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const siteFilterId = "cctv-cameras-site-filter"
  const areaFilterId = "cctv-cameras-area-filter"
  const statusFilterId = "cctv-cameras-status-filter"

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
  const activeSiteName =
    sites.find((site) => site.id === selectedSiteId)?.name || "All Sites"
  const onlineCount = cameras.filter((camera) => camera.isOnline).length
  const offlineCount = cameras.filter((camera) => !camera.isOnline).length
  const exportDisabled = isLoading || cameras.length === 0

  const deactivateMutation = useMutation({
    mutationFn: async (cameraId: string) =>
      fetchJson(`/api/cctv/cameras/${cameraId}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cameras"] })
      toast({
        title: "Camera deactivated",
        description: "The camera has been removed from active monitoring.",
      })
    },
    onError: (error: unknown) => {
      toast({
        title: "Unable to deactivate camera",
        description: getApiErrorMessage(error),
        variant: "destructive",
      })
    },
  })

  // Get unique areas for filtering
  const areas = Array.from(
    new Set(cameras.map((camera) => camera.area).filter((area) => area && area.trim())),
  ).sort()

  if (error) {
    return (
      <StatusState
        variant="error"
        title="Unable to load cameras"
        description={getApiErrorMessage(error)}
      />
    )
  }

  return (
    <div className="space-y-4">
      <PageIntro
        title="Cameras"
        purpose="View registered cameras, check health, and maintain monitoring assignments."
        nextStep="Filter by site or status, then edit or deactivate where needed."
      />

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-4">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium" htmlFor={siteFilterId}>
                Site:
              </label>
              <Select
                value={selectedSiteId}
                onValueChange={(value) =>
                  onSiteChange(value === "__all_sites__" ? "" : value)
                }
              >
                <SelectTrigger id={siteFilterId} className="w-[180px]">
                  <SelectValue placeholder="All Sites" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all_sites__">All Sites</SelectItem>
                  {sites.map((site) => (
                    <SelectItem key={site.id} value={site.id}>
                      {site.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-sm font-medium" htmlFor={areaFilterId}>
                Area:
              </label>
              <Select
                value={areaFilter}
                onValueChange={(value) =>
                  setAreaFilter(value === "__all_areas__" ? "" : value)
                }
              >
                <SelectTrigger id={areaFilterId} className="w-[180px]">
                  <SelectValue placeholder="All Areas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all_areas__">All Areas</SelectItem>
                  {areas.map((area) => (
                    <SelectItem key={area} value={area}>
                      {area}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-sm font-medium" htmlFor={statusFilterId}>
                Status:
              </label>
              <Select
                value={statusFilter}
                onValueChange={(value) =>
                  setStatusFilter(value === "__all_status__" ? "" : value)
                }
              >
                <SelectTrigger id={statusFilterId} className="w-[180px]">
                  <SelectValue placeholder="All Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all_status__">All Status</SelectItem>
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

            <ExportMenu
              variant="outline"
              size="sm"
              disabled={exportDisabled}
              onExport={(format: DocumentExportFormat) => {
                if (!camerasPdfRef.current) return
                return exportElementToDocument(
                  camerasPdfRef.current,
                  `cctv-cameras-${selectedSiteId || "all-sites"}.${format}`,
                  format,
                )
              }}
            />
          </div>
          {!isLoading ? (
            <p className="mt-4 text-xs text-muted-foreground" role="status" aria-live="polite">
              Showing {cameras.length} camera{cameras.length === 1 ? "" : "s"} for {activeSiteName}.
            </p>
          ) : null}
        </CardContent>
      </Card>

      {!isLoading && cameras.length > 0 && offlineCount === 0 ? (
        <Alert variant="success">
          <AlertTitle>All cameras online</AlertTitle>
          <AlertDescription>All listed cameras are currently reachable.</AlertDescription>
        </Alert>
      ) : null}

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
            <Card
              key={camera.id}
              className={`hover:shadow-lg transition-shadow ${
                createdId === camera.id ? "border-[var(--status-success-border)] bg-[var(--status-success-bg)]" : ""
              }`}
            >
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
                      Channel {camera.channelNumber} | {camera.area}
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

                  <div className="flex items-center gap-2 pt-2 border-t">
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/cctv/cameras/${camera.id}/edit`}>
                        <Pencil className="mr-1 h-3 w-3" />
                        Edit
                      </Link>
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => deactivateMutation.mutate(camera.id)}
                      disabled={deactivateMutation.isPending}
                    >
                      <Trash2 className="mr-1 h-3 w-3" />
                      Deactivate
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="absolute left-[-9999px] top-0">
        <div ref={camerasPdfRef}>
          <PdfTemplate
            title="CCTV Cameras"
            subtitle={`${activeSiteName} | ${areaFilter || "All areas"} | ${statusFilter || "All statuses"}`}
            meta={[
              { label: "Site", value: activeSiteName },
              { label: "Total cameras", value: String(cameras.length) },
              { label: "Online", value: String(onlineCount) },
              { label: "Offline", value: String(offlineCount) },
            ]}
          >
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-200 text-left">
                  <th className="py-2">Camera</th>
                  <th className="py-2">Area</th>
                  <th className="py-2">Site</th>
                  <th className="py-2">NVR</th>
                  <th className="py-2">Status</th>
                  <th className="py-2">Recording</th>
                </tr>
              </thead>
              <tbody>
                {cameras.map((camera) => (
                  <tr key={camera.id} className="border-b border-gray-100">
                    <td className="py-2">
                      <div className="font-semibold">{camera.name}</div>
                      <div className="text-[10px] text-gray-500">
                        Channel {camera.channelNumber}
                      </div>
                    </td>
                    <td className="py-2">{camera.area}</td>
                    <td className="py-2">{camera.site?.name || "Unknown"}</td>
                    <td className="py-2">{camera.nvr?.name || "Unknown"}</td>
                    <td className="py-2">
                      {camera.isOnline ? "Online" : "Offline"}
                    </td>
                    <td className="py-2">
                      {camera.isRecording ? "Active" : "Inactive"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </PdfTemplate>
        </div>
      </div>
    </div>
  )
}
