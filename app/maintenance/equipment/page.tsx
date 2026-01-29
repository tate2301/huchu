"use client"

import { useEffect, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Download, QrCode } from "lucide-react"

import { PageHeading } from "@/components/layout/page-heading"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { fetchEquipment, fetchSites } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-client"
import { MaintenanceNav } from "../maintenance-nav"
import { equipmentStatus, formatDate } from "../utils"

export default function EquipmentPage() {
  const [selectedSiteId, setSelectedSiteId] = useState("")

  const { data: sites, isLoading: sitesLoading, error: sitesError } = useQuery({
    queryKey: ["sites"],
    queryFn: fetchSites,
  })

  useEffect(() => {
    if (!selectedSiteId && sites && sites.length > 0) {
      setSelectedSiteId(sites[0].id)
    }
  }, [selectedSiteId, sites])

  const {
    data: equipmentData,
    isLoading: equipmentLoading,
    error: equipmentError,
  } = useQuery({
    queryKey: ["equipment", selectedSiteId],
    queryFn: () => fetchEquipment({ siteId: selectedSiteId, limit: 200 }),
    enabled: !!selectedSiteId,
  })

  const equipment = equipmentData?.data ?? []
  const error = sitesError || equipmentError

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <PageHeading
        title="Equipment Register"
        description="All tracked equipment across sites"
      />

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Unable to load equipment data</AlertTitle>
          <AlertDescription>{getApiErrorMessage(error)}</AlertDescription>
        </Alert>
      )}

      <MaintenanceNav />

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Equipment Register</CardTitle>
              <CardDescription>All tracked equipment across sites</CardDescription>
            </div>
            <Button variant="outline" size="sm">
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-4">
            {sitesLoading ? (
              <Skeleton className="h-9 w-full" />
            ) : (
              <Select value={selectedSiteId} onValueChange={setSelectedSiteId}>
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

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted">
                <tr>
                  <th className="text-left p-3 text-sm font-medium">Code</th>
                  <th className="text-left p-3 text-sm font-medium">Equipment Name</th>
                  <th className="text-left p-3 text-sm font-medium">Category</th>
                  <th className="text-left p-3 text-sm font-medium">QR Code</th>
                  <th className="text-left p-3 text-sm font-medium">Last Service</th>
                  <th className="text-left p-3 text-sm font-medium">Next Service</th>
                  <th className="text-right p-3 text-sm font-medium">Hours</th>
                  <th className="text-center p-3 text-sm font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {equipmentLoading ? (
                  <tr>
                    <td colSpan={8} className="p-3">
                      <Skeleton className="h-10 w-full" />
                    </td>
                  </tr>
                ) : equipment.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-3 text-sm text-muted-foreground">
                      No equipment found for this site.
                    </td>
                  </tr>
                ) : (
                  equipment.map((item) => {
                    const statusInfo = equipmentStatus(item)
                    return (
                      <tr key={item.id} className="border-b hover:bg-muted/60">
                        <td className="p-3 text-sm font-mono">{item.equipmentCode}</td>
                        <td className="p-3 text-sm font-medium">{item.name}</td>
                        <td className="p-3 text-sm">{item.category}</td>
                        <td className="p-3 text-sm">
                          <Button variant="ghost" size="sm" className="gap-2">
                            <QrCode className="h-4 w-4" />
                            {item.qrCode || "—"}
                          </Button>
                        </td>
                        <td className="p-3 text-sm">{formatDate(item.lastServiceDate)}</td>
                        <td className="p-3 text-sm">{formatDate(item.nextServiceDue)}</td>
                        <td className="p-3 text-sm text-right font-medium">
                          {item.serviceHours ? `${item.serviceHours}h` : "—"}
                        </td>
                        <td className="p-3 text-center">
                          <Badge className={statusInfo.className}>{statusInfo.label}</Badge>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
