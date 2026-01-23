"use client"

import { useEffect, useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useSearchParams, useRouter } from "next/navigation"
import { differenceInMinutes, format } from "date-fns"
import {
  AlertTriangle,
  Calendar,
  CheckCircle,
  Clock,
  Download,
  Plus,
  QrCode,
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
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/components/ui/use-toast"
import { fetchEquipment, fetchSites, fetchUsers, fetchWorkOrders } from "@/lib/api"
import { fetchJson, getApiErrorMessage } from "@/lib/api-client"

const maintenanceViews = [
  "dashboard",
  "equipment",
  "work-orders",
  "breakdown",
  "schedule",
] as const

type MaintenanceView = (typeof maintenanceViews)[number]

const formatDate = (value?: string | null) => {
  if (!value) return "—"
  return format(new Date(value), "yyyy-MM-dd")
}

const getDowntimeHours = (start: string, end?: string | null) => {
  const startDate = new Date(start)
  const endDate = end ? new Date(end) : new Date()
  const minutes = Math.max(0, differenceInMinutes(endDate, startDate))
  return (minutes / 60).toFixed(1)
}

export default function MaintenancePage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const viewParam = searchParams.get("view")
  const initialView = maintenanceViews.includes(viewParam as MaintenanceView)
    ? (viewParam as MaintenanceView)
    : "dashboard"

  const [activeView, setActiveView] = useState<MaintenanceView>(initialView)
  const [selectedSiteId, setSelectedSiteId] = useState("")
  const [breakdownForm, setBreakdownForm] = useState({
    siteId: "",
    equipmentId: "",
    issue: "",
    downtimeStart: "",
    technicianId: "",
  })

  const changeView = (view: MaintenanceView) => {
    setActiveView(view)
    const params = new URLSearchParams(searchParams.toString())
    params.set("view", view)
    router.replace(`/maintenance?${params.toString()}`)
  }

  const { data: sites, isLoading: sitesLoading, error: sitesError } = useQuery({
    queryKey: ["sites"],
    queryFn: fetchSites,
  })

  useEffect(() => {
    if (!selectedSiteId && sites && sites.length > 0) {
      setSelectedSiteId(sites[0].id)
      setBreakdownForm((prev) => ({ ...prev, siteId: sites[0].id }))
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

  const {
    data: usersData,
    isLoading: usersLoading,
    error: usersError,
  } = useQuery({
    queryKey: ["users", "technicians"],
    queryFn: () => fetchUsers({ active: true, limit: 200 }),
  })

  const equipment = equipmentData?.data ?? []
  const workOrders = workOrdersData?.data ?? []
  const technicians = usersData?.data ?? []

  const equipmentStatus = (item: {
    isActive: boolean
    nextServiceDue?: string | null
  }) => {
    if (!item.isActive) {
      return { label: "Down", className: "bg-destructive/10 text-destructive" }
    }
    if (item.nextServiceDue && new Date(item.nextServiceDue) < new Date()) {
      return { label: "Needs Service", className: "bg-amber-100 text-amber-800" }
    }
    return { label: "Operational", className: "bg-emerald-100 text-emerald-800" }
  }

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

  const createWorkOrderMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) =>
      fetchJson("/api/work-orders", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      toast({
        title: "Work order created",
        description: "Breakdown logged and added to the work order list.",
        variant: "success",
      })
      setBreakdownForm((prev) => ({
        ...prev,
        equipmentId: "",
        issue: "",
        downtimeStart: "",
        technicianId: "",
      }))
      queryClient.invalidateQueries({ queryKey: ["work-orders"] })
      changeView("work-orders")
    },
  })

  const handleBreakdownSubmit = (event: React.FormEvent) => {
    event.preventDefault()

    if (
      !breakdownForm.equipmentId ||
      !breakdownForm.issue ||
      !breakdownForm.downtimeStart
    ) {
      toast({
        title: "Missing details",
        description: "Equipment, issue, and downtime start are required.",
        variant: "destructive",
      })
      return
    }

    createWorkOrderMutation.mutate({
      equipmentId: breakdownForm.equipmentId,
      issue: breakdownForm.issue,
      downtimeStart: breakdownForm.downtimeStart,
      technicianId: breakdownForm.technicianId || undefined,
      status: "OPEN",
    })
  }

  const error =
    sitesError ||
    equipmentError ||
    workOrdersError ||
    usersError ||
    createWorkOrderMutation.error

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <PageActions>
        <Button size="sm" onClick={() => changeView("breakdown")}> 
          <Plus className="h-4 w-4" />
          Log Breakdown
        </Button>
        <Button size="sm" variant="outline" onClick={() => changeView("work-orders")}> 
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

      <Tabs
        value={activeView}
        onValueChange={(value) => changeView(value as MaintenanceView)}
        className="space-y-6"
      >
        <Card>
          <CardContent className="py-3">
            <TabsList className="flex w-full flex-wrap justify-start gap-2 bg-transparent p-0 h-auto">
              <TabsTrigger value="dashboard" className="gap-2 border border-border">
                <Wrench className="h-4 w-4" />
                Dashboard
              </TabsTrigger>
              <TabsTrigger value="equipment" className="border border-border">
                Equipment Register
              </TabsTrigger>
              <TabsTrigger value="work-orders" className="border border-border">
                Work Orders
              </TabsTrigger>
              <TabsTrigger value="breakdown" className="gap-2 border border-border">
                <Plus className="h-4 w-4" />
                Log Breakdown
              </TabsTrigger>
              <TabsTrigger value="schedule" className="gap-2 border border-border">
                <Calendar className="h-4 w-4" />
                PM Schedule
              </TabsTrigger>
            </TabsList>
          </CardContent>
        </Card>

        <TabsContent value="dashboard" className="mt-0">
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
        </TabsContent>

        <TabsContent value="equipment" className="mt-0">
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
        </TabsContent>
