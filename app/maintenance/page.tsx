"use client"

import { useEffect, useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import { format } from "date-fns"
import {
  AlertTriangle,
  Calendar,
  CheckCircle,
  Clock,
  Plus,
  Wrench,
} from "lucide-react"

import { PageActions } from "@/components/layout/page-actions"
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
import { Skeleton } from "@/components/ui/skeleton"
import { fetchEquipment, fetchSites, fetchWorkOrders } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-client"
import { MaintenanceNav } from "./maintenance-nav"
import { equipmentStatus, getDowntimeHours } from "./utils"

export default function MaintenanceDashboardPage() {
  const router = useRouter()
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

  const {
    data: workOrdersData,
    isLoading: workOrdersLoading,
    error: workOrdersError,
  } = useQuery({
    queryKey: ["work-orders", selectedSiteId],
    queryFn: () => fetchWorkOrders({ siteId: selectedSiteId, limit: 200 }),
    enabled: !!selectedSiteId,
  })

  const equipment = equipmentData?.data ?? []
  const workOrders = workOrdersData?.data ?? []

  const totalEquipment = equipment.length
  const operationalCount = equipment.filter(
    (item) => equipmentStatus(item).label === "Operational",
  ).length
  const downCount = equipment.filter(
    (item) => equipmentStatus(item).label === "Down",
  ).length
  const needsServiceCount = equipment.filter(
    (item) => equipmentStatus(item).label === "Needs Service",
  ).length
  const activeWorkOrders = workOrders.filter(
    (order) => order.status !== "COMPLETED",
  )
  const openWorkOrders = workOrders.filter(
    (order) => order.status === "OPEN" || order.status === "IN_PROGRESS",
  ).length

  const upcomingMaintenance = useMemo(() => {
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
        }
      })
      .filter((item) => item.daysUntil >= 0 && item.daysUntil <= 90)
      .sort((a, b) => a.daysUntil - b.daysUntil)
  }, [equipment])

  const nextPmDue = upcomingMaintenance.length > 0 ? upcomingMaintenance[0].daysUntil : null

  const error = sitesError || equipmentError || workOrdersError

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <PageActions>
        <Button size="sm" onClick={() => router.push("/maintenance/breakdown")}>
          <Plus className="h-4 w-4" />
          Log Breakdown
        </Button>
        <Button size="sm" variant="outline" onClick={() => router.push("/maintenance/work-orders")}>
          Work Orders
        </Button>
      </PageActions>

      <PageHeading
        title="Maintenance Management"
        description="Equipment tracking and work orders"
      />

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Unable to load maintenance data</AlertTitle>
          <AlertDescription>{getApiErrorMessage(error)}</AlertDescription>
        </Alert>
      )}

      <MaintenanceNav />

      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Card className="py-4 gap-3">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Equipment Status</CardTitle>
              <CardDescription className="text-xs">
                Live availability snapshot
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2">
              {equipmentLoading ? (
                <Skeleton className="h-8 w-full" />
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 w-full justify-between px-2"
                >
                  <div className="flex items-center gap-2 text-left">
                    <Wrench className="h-4 w-4 text-muted-foreground" />
                    <span className="text-xs">Total Equipment</span>
                  </div>
                  <span className="text-sm font-semibold">{totalEquipment}</span>
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 w-full justify-between px-2"
              >
                <div className="flex items-center gap-2 text-left">
                  <CheckCircle className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs">Operational</span>
                </div>
                <span className="text-sm font-semibold">{operationalCount}</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 w-full justify-between px-2"
              >
                <div className="flex items-center gap-2 text-left">
                  <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs">Needs Service</span>
                </div>
                <span className="text-sm font-semibold text-amber-600">
                  {needsServiceCount}
                </span>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 w-full justify-between px-2"
              >
                <div className="flex items-center gap-2 text-left">
                  <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs">Equipment Down</span>
                </div>
                <span className="text-sm font-semibold text-destructive">
                  {downCount}
                </span>
              </Button>
            </CardContent>
          </Card>

          <Card className="py-4 gap-3">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Work Orders</CardTitle>
              <CardDescription className="text-xs">Current workload</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 w-full justify-between px-2"
              >
                <div className="flex items-center gap-2 text-left">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs">Active Work Orders</span>
                </div>
                <span className="text-sm font-semibold">{openWorkOrders}</span>
              </Button>
            </CardContent>
          </Card>

          <Card className="py-4 gap-3">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">
                Preventive Maintenance
              </CardTitle>
              <CardDescription className="text-xs">
                Scheduled services
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 w-full justify-between px-2"
              >
                <div className="flex items-center gap-2 text-left">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs">Upcoming (90 days)</span>
                </div>
                <span className="text-sm font-semibold">
                  {upcomingMaintenance.length}
                </span>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 w-full justify-between px-2"
              >
                <div className="flex items-center gap-2 text-left">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs">Next Due</span>
                </div>
                <span className="text-sm font-semibold">
                  {nextPmDue !== null ? `${nextPmDue} days` : "None"}
                </span>
              </Button>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="py-4 gap-3">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Active Work Orders</CardTitle>
              <CardDescription className="text-xs">
                Open and in-progress tasks
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2">
              {workOrdersLoading ? (
                <Skeleton className="h-12 w-full" />
              ) : activeWorkOrders.length === 0 ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 w-full"
                  disabled
                >
                  No active work orders
                </Button>
              ) : (
                activeWorkOrders.map((order) => (
                  <Button
                    key={order.id}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-auto w-full items-start justify-between gap-3 whitespace-normal px-2 py-1.5"
                  >
                    <div className="flex flex-col items-start gap-1 text-left">
                      <span className="text-sm font-medium">{order.equipment.name}</span>
                      <span className="text-xs text-muted-foreground">{order.issue}</span>
                      <span className="text-xs text-muted-foreground">
                        {order.equipment.equipmentCode} | {order.id}
                      </span>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Badge variant={order.status === "OPEN" ? "destructive" : "secondary"}>
                        {order.status === "OPEN" ? "Open" : "In Progress"}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {getDowntimeHours(order.downtimeStart, order.downtimeEnd)}h
                      </span>
                    </div>
                  </Button>
                ))
              )}
            </CardContent>
          </Card>

          <Card className="py-4 gap-3">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Upcoming Maintenance</CardTitle>
              <CardDescription className="text-xs">
                Scheduled in the next 90 days
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2">
              {upcomingMaintenance.length === 0 ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 w-full"
                  disabled
                >
                  No upcoming services
                </Button>
              ) : (
                upcomingMaintenance.map((item) => (
                  <Button
                    key={item.equipment.id}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-auto w-full items-start justify-between gap-3 whitespace-normal px-2 py-1.5"
                  >
                    <div className="flex flex-col items-start text-left">
                      <span className="text-sm font-medium">{item.equipment.name}</span>
                      <span className="text-xs text-muted-foreground">Scheduled Service</span>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className="text-xs font-medium">{item.dueDate}</span>
                      <Badge variant={item.daysUntil < 14 ? "destructive" : "secondary"}>
                        {item.daysUntil} days
                      </Badge>
                    </div>
                  </Button>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
