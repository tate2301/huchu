"use client"

import { useEffect, useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { format } from "date-fns"
import { Calendar } from "lucide-react"

import { PageHeading } from "@/components/layout/page-heading"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
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

export default function SchedulePage() {
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

  const scheduledMaintenance = useMemo(() => {
    return equipment
      .filter((item) => item.nextServiceDue)
      .map((item) => {
        const dueDate = new Date(item.nextServiceDue as string)
        const daysUntil = Math.floor(
          (dueDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24),
        )
        return {
          equipment: item,
          dueDate: format(dueDate, "yyyy-MM-dd"),
          daysUntil,
          isPastDue: daysUntil < 0,
          isDueSoon: daysUntil >= 0 && daysUntil <= 14,
        }
      })
      .sort((a, b) => a.daysUntil - b.daysUntil)
  }, [equipment])

  const error = sitesError || equipmentError

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <PageHeading
        title="PM Schedule"
        description="Preventive maintenance schedule"
      />

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Unable to load schedule data</AlertTitle>
          <AlertDescription>{getApiErrorMessage(error)}</AlertDescription>
        </Alert>
      )}

      <MaintenanceNav />

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Preventive Maintenance Schedule
              </CardTitle>
              <CardDescription>Upcoming and overdue maintenance tasks</CardDescription>
            </div>
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

          <div className="space-y-2">
            {equipmentLoading ? (
              <Skeleton className="h-20 w-full" />
            ) : scheduledMaintenance.length === 0 ? (
              <div className="text-center py-8 text-sm text-muted-foreground">
                No scheduled maintenance found for this site.
              </div>
            ) : (
              scheduledMaintenance.map((item) => (
                <Card key={item.equipment.id}>
                  <CardContent className="pt-6">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-medium">{item.equipment.name}</h3>
                          <Badge
                            variant={
                              item.isPastDue
                                ? "destructive"
                                : item.isDueSoon
                                  ? "default"
                                  : "secondary"
                            }
                          >
                            {item.isPastDue
                              ? `${Math.abs(item.daysUntil)} days overdue`
                              : item.isDueSoon
                                ? `Due in ${item.daysUntil} days`
                                : `${item.daysUntil} days`}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          Scheduled Service
                        </p>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <span>Code: {item.equipment.equipmentCode}</span>
                          <span>Category: {item.equipment.category}</span>
                          <span>Due: {item.dueDate}</span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
