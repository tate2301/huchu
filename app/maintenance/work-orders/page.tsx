"use client"

import { useEffect, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Clock } from "lucide-react"

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
import { fetchSites, fetchWorkOrders } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-client"
import { MaintenanceNav } from "../maintenance-nav"
import { getDowntimeHours } from "../utils"

export default function WorkOrdersPage() {
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
    data: workOrdersData,
    isLoading: workOrdersLoading,
    error: workOrdersError,
  } = useQuery({
    queryKey: ["work-orders", selectedSiteId],
    queryFn: () => fetchWorkOrders({ siteId: selectedSiteId, limit: 200 }),
    enabled: !!selectedSiteId,
  })

  const workOrders = workOrdersData?.data ?? []
  const error = sitesError || workOrdersError

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <PageHeading
        title="Work Orders"
        description="Manage maintenance work orders"
      />

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Unable to load work orders</AlertTitle>
          <AlertDescription>{getApiErrorMessage(error)}</AlertDescription>
        </Alert>
      )}

      <MaintenanceNav />

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Work Orders</CardTitle>
              <CardDescription>All work orders for selected site</CardDescription>
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
            {workOrdersLoading ? (
              <Skeleton className="h-20 w-full" />
            ) : workOrders.length === 0 ? (
              <div className="text-center py-8 text-sm text-muted-foreground">
                No work orders found for this site.
              </div>
            ) : (
              workOrders.map((order) => (
                <Card key={order.id}>
                  <CardContent className="pt-6">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-medium">{order.equipment.name}</h3>
                          <Badge
                            variant={
                              order.status === "OPEN"
                                ? "destructive"
                                : order.status === "IN_PROGRESS"
                                  ? "default"
                                  : "secondary"
                            }
                          >
                            {order.status}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">{order.issue}</p>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <span>Code: {order.equipment.equipmentCode}</span>
                          <span>ID: {order.id}</span>
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {getDowntimeHours(order.downtimeStart, order.downtimeEnd)}h downtime
                          </span>
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
