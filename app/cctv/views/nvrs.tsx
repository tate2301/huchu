"use client"

import Link from "next/link"
import { useRef, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Server, CheckCircle, XCircle, Clock, Pencil, Trash2 } from "@/lib/icons"

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
import { fetchNVRs, Site } from "@/lib/api"
import { fetchJson, getApiErrorMessage } from "@/lib/api-client"
import { type DocumentExportFormat } from "@/lib/documents/export-client"
import { exportElementToDocument } from "@/lib/pdf"
import { useToast } from "@/components/ui/use-toast"

interface NVRsViewProps {
  sites: Site[]
  selectedSiteId: string
  onSiteChange: (siteId: string) => void
  createdId?: string | null
}

export function NVRsView({ sites, selectedSiteId, onSiteChange, createdId }: NVRsViewProps) {
  const nvrsPdfRef = useRef<HTMLDivElement | null>(null)
  const [statusFilter, setStatusFilter] = useState<string>("")
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const siteFilterId = "cctv-nvrs-site-filter"
  const statusFilterId = "cctv-nvrs-status-filter"

  const { data, isLoading, error } = useQuery({
    queryKey: ["nvrs", selectedSiteId, statusFilter],
    queryFn: () =>
      fetchNVRs({
        siteId: selectedSiteId || undefined,
        isOnline: statusFilter === "online" ? true : statusFilter === "offline" ? false : undefined,
      }),
  })

  const nvrs = data?.data || []
  const activeSiteName =
    sites.find((site) => site.id === selectedSiteId)?.name || "All Sites"
  const onlineCount = nvrs.filter((nvr) => nvr.isOnline).length
  const offlineCount = nvrs.filter((nvr) => !nvr.isOnline).length
  const exportDisabled = isLoading || nvrs.length === 0

  const deactivateMutation = useMutation({
    mutationFn: async (nvrId: string) =>
      fetchJson(`/api/cctv/nvrs/${nvrId}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["nvrs"] })
      toast({
        title: "NVR deactivated",
        description: "The recorder has been removed from active use.",
      })
    },
    onError: (error: unknown) => {
      toast({
        title: "Unable to deactivate NVR",
        description: getApiErrorMessage(error),
        variant: "destructive",
      })
    },
  })

  if (error) {
    return (
      <StatusState
        variant="error"
        title="Unable to load NVRs"
        description={getApiErrorMessage(error)}
      />
    )
  }

  return (
    <div className="space-y-4">
      <PageIntro
        title="NVRs"
        purpose="Manage recorder devices and confirm network stream readiness by site."
        nextStep="Filter recorders, inspect status, then edit or deactivate as required."
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

            <ExportMenu
              variant="outline"
              size="sm"
              disabled={exportDisabled}
              onExport={(format: DocumentExportFormat) => {
                if (!nvrsPdfRef.current) return
                return exportElementToDocument(
                  nvrsPdfRef.current,
                  `cctv-nvrs-${selectedSiteId || "all-sites"}.${format}`,
                  format,
                )
              }}
            />
          </div>
          {!isLoading ? (
            <p className="mt-4 text-xs text-muted-foreground" role="status" aria-live="polite">
              Showing {nvrs.length} NVR{nvrs.length === 1 ? "" : "s"} for {activeSiteName}.
            </p>
          ) : null}
        </CardContent>
      </Card>

      {!isLoading && nvrs.length > 0 && offlineCount === 0 ? (
        <Alert variant="success">
          <AlertTitle>All NVRs online</AlertTitle>
          <AlertDescription>All listed recorders are connected and healthy.</AlertDescription>
        </Alert>
      ) : null}

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
            <Card
              key={nvr.id}
              className={`hover:shadow-lg transition-shadow ${
                createdId === nvr.id ? "border-[var(--status-success-border)] bg-[var(--status-success-bg)]" : ""
              }`}
            >
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-base">{nvr.name}</CardTitle>
                    <CardDescription className="mt-1">
                      {nvr.manufacturer}
                      {nvr.model && ` | ${nvr.model}`}
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

                  <div className="flex items-center gap-2 pt-2 border-t">
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/cctv/nvrs/${nvr.id}/edit`}>
                        <Pencil className="mr-1 h-3 w-3" />
                        Edit
                      </Link>
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => deactivateMutation.mutate(nvr.id)}
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
        <div ref={nvrsPdfRef}>
          <PdfTemplate
            title="CCTV NVRs"
            subtitle={`${activeSiteName} | ${statusFilter || "All statuses"}`}
            meta={[
              { label: "Site", value: activeSiteName },
              { label: "Total NVRs", value: String(nvrs.length) },
              { label: "Online", value: String(onlineCount) },
              { label: "Offline", value: String(offlineCount) },
            ]}
          >
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-200 text-left">
                  <th className="py-2">NVR</th>
                  <th className="py-2">Site</th>
                  <th className="py-2">IP</th>
                  <th className="py-2">Ports</th>
                  <th className="py-2">Status</th>
                  <th className="py-2 text-right">Cameras</th>
                </tr>
              </thead>
              <tbody>
                {nvrs.map((nvr) => (
                  <tr key={nvr.id} className="border-b border-gray-100">
                    <td className="py-2">
                      <div className="font-semibold">{nvr.name}</div>
                      <div className="text-[10px] text-gray-500">
                        {nvr.manufacturer}
                        {nvr.model ? ` | ${nvr.model}` : ""}
                      </div>
                    </td>
                    <td className="py-2">{nvr.site?.name || "Unknown"}</td>
                    <td className="py-2 font-mono">{nvr.ipAddress}</td>
                    <td className="py-2 font-mono">
                      RTSP {nvr.port} / HTTP {nvr.httpPort}
                    </td>
                    <td className="py-2">
                      {nvr.isOnline ? "Online" : "Offline"}
                    </td>
                    <td className="py-2 text-right">
                      {nvr._count?.cameras ?? 0}
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
