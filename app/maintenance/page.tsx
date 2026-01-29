"use client"

import { useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useSearchParams, useRouter } from "next/navigation"
import { differenceInMinutes, format } from "date-fns"
import {
  AlertTriangle,
  Calendar,
  CheckCircle,
  Clock,
  Download,
  Pencil,
  Plus,
  QrCode,
  Trash2,
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
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/components/ui/use-toast"
import { fetchEmployees, fetchEquipment, fetchSites, fetchWorkOrders } from "@/lib/api"
import { fetchJson, getApiErrorMessage } from "@/lib/api-client"

const maintenanceViews = [
  "dashboard",
  "equipment",
  "work-orders",
  "breakdown",
  "schedule",
] as const

type MaintenanceView = (typeof maintenanceViews)[number]

const equipmentCategories = ["CRUSHER", "MILL", "PUMP", "GENERATOR", "VEHICLE", "OTHER"] as const
const measurementUnits = ["tonnes", "trips", "wheelbarrows"] as const

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

const formatDateInput = (value?: string | null) => {
  if (!value) return ""
  return format(new Date(value), "yyyy-MM-dd")
}

const formatDateTime = (value?: string | null) => {
  if (!value) return "-"
  return format(new Date(value), "yyyy-MM-dd HH:mm")
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
    equipmentId: "",
    issue: "",
    downtimeStart: "",
    technicianId: "",
  })
  const [breakdownFormOpen, setBreakdownFormOpen] = useState(false)
  const [breakdownNestedTarget, setBreakdownNestedTarget] = useState<
    "equipment" | "technician" | null
  >(null)
  const [siteFormOpen, setSiteFormOpen] = useState(false)
  const [technicianFormOpen, setTechnicianFormOpen] = useState(false)
  const [siteForm, setSiteForm] = useState({
    name: "",
    code: "",
    location: "",
    measurementUnit: "tonnes",
  })
  const [technicianForm, setTechnicianForm] = useState({
    name: "",
    phone: "",
    nextOfKinName: "",
    nextOfKinPhone: "",
    passportPhotoUrl: "",
    villageOfOrigin: "",
  })
  const [equipmentFormOpen, setEquipmentFormOpen] = useState(false)
  const [editingEquipmentId, setEditingEquipmentId] = useState<string | null>(null)
  const [equipmentForm, setEquipmentForm] = useState({
    equipmentCode: "",
    name: "",
    category: "OTHER",
    siteId: "",
    qrCode: "",
    lastServiceDate: "",
    nextServiceDue: "",
    serviceHours: "",
    serviceDays: "",
    isActive: true,
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

  const activeSiteId = selectedSiteId || sites?.[0]?.id || ""

  const {
    data: equipmentData,
    isLoading: equipmentLoading,
    error: equipmentError,
  } = useQuery({
    queryKey: ["equipment", activeSiteId],
    queryFn: () => fetchEquipment({ siteId: activeSiteId, limit: 200 }),
    enabled: !!activeSiteId,
  })

  const {
    data: workOrdersData,
    isLoading: workOrdersLoading,
    error: workOrdersError,
  } = useQuery({
    queryKey: ["work-orders", activeSiteId],
    queryFn: () => fetchWorkOrders({ siteId: activeSiteId, limit: 200 }),
    enabled: !!activeSiteId,
  })

  const {
    data: employeesData,
    isLoading: employeesLoading,
    error: employeesError,
  } = useQuery({
    queryKey: ["employees", "technicians"],
    queryFn: () => fetchEmployees({ active: true, limit: 500 }),
  })

  const equipment = equipmentData?.data ?? []
  const workOrders = workOrdersData?.data ?? []
  const technicians = employeesData?.data ?? []

  const resetEquipmentForm = (overrides: Partial<typeof equipmentForm> = {}) => {
    setEquipmentForm({
      equipmentCode: "",
      name: "",
      category: "OTHER",
      siteId: "",
      qrCode: "",
      lastServiceDate: "",
      nextServiceDue: "",
      serviceHours: "",
      serviceDays: "",
      isActive: true,
      ...overrides,
    })
  }

  const resetBreakdownForm = (overrides: Partial<typeof breakdownForm> = {}) => {
    setBreakdownForm({
      equipmentId: "",
      issue: "",
      downtimeStart: "",
      technicianId: "",
      ...overrides,
    })
  }

  const resetSiteForm = (overrides: Partial<typeof siteForm> = {}) => {
    setSiteForm({
      name: "",
      code: "",
      location: "",
      measurementUnit: "tonnes",
      ...overrides,
    })
  }

  const resetTechnicianForm = (overrides: Partial<typeof technicianForm> = {}) => {
    setTechnicianForm({
      name: "",
      phone: "",
      nextOfKinName: "",
      nextOfKinPhone: "",
      passportPhotoUrl: "",
      villageOfOrigin: "",
      ...overrides,
    })
  }

  const toOptionalNumber = (value: string) => {
    if (value.trim() === "") return undefined
    const parsed = Number(value)
    return Number.isNaN(parsed) ? undefined : parsed
  }

  const openBreakdownForm = () => {
    if (!selectedSiteId && sites?.[0]?.id) {
      setSelectedSiteId(sites[0].id)
    }
    setBreakdownFormOpen(true)
  }

  const openSiteForm = () => {
    resetSiteForm()
    setSiteFormOpen(true)
  }

  const openTechnicianForm = () => {
    resetTechnicianForm()
    setTechnicianFormOpen(true)
  }

  const openNewEquipmentForm = () => {
    const defaultSiteId = selectedSiteId || sites?.[0]?.id || ""
    setEditingEquipmentId(null)
    resetEquipmentForm({ siteId: defaultSiteId })
    setEquipmentFormOpen(true)
  }

  const openEditEquipmentForm = (item: (typeof equipment)[number]) => {
    setEditingEquipmentId(item.id)
    resetEquipmentForm({
      equipmentCode: item.equipmentCode ?? "",
      name: item.name ?? "",
      category: item.category ?? "OTHER",
      siteId: item.siteId ?? selectedSiteId,
      qrCode: item.qrCode ?? "",
      lastServiceDate: formatDateInput(item.lastServiceDate),
      nextServiceDue: formatDateInput(item.nextServiceDue),
      serviceHours:
        item.serviceHours !== null && item.serviceHours !== undefined
          ? String(item.serviceHours)
          : "",
      serviceDays:
        item.serviceDays !== null && item.serviceDays !== undefined
          ? String(item.serviceDays)
          : "",
      isActive: item.isActive,
    })
    setEquipmentFormOpen(true)
  }

  const handleEquipmentChange =
    (field: keyof typeof equipmentForm) =>
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setEquipmentForm((prev) => ({ ...prev, [field]: event.target.value }))
    }

  const handleSiteFilterChange = (value: string) => {
    if (value === "__add_site__") {
      openSiteForm()
      return
    }
    setSelectedSiteId(value)
  }

  const handleEquipmentSelect = (field: "category" | "siteId") => (value: string) => {
    setEquipmentForm((prev) => ({ ...prev, [field]: value }))
  }

  const handleEquipmentSiteSelect = (value: string) => {
    if (value === "__add_site__") {
      openSiteForm()
      return
    }
    handleEquipmentSelect("siteId")(value)
  }

  const handleBreakdownEquipmentSelect = (value: string) => {
    if (value === "__add_equipment__") {
      setBreakdownNestedTarget("equipment")
      openNewEquipmentForm()
      return
    }
    setBreakdownForm((prev) => ({ ...prev, equipmentId: value }))
  }

  const handleBreakdownTechnicianSelect = (value: string) => {
    if (value === "__add_technician__") {
      setBreakdownNestedTarget("technician")
      openTechnicianForm()
      return
    }
    setBreakdownForm((prev) => ({ ...prev, technicianId: value }))
  }

  const handleSiteFormChange =
    (field: keyof typeof siteForm) => (event: React.ChangeEvent<HTMLInputElement>) => {
      setSiteForm((prev) => ({ ...prev, [field]: event.target.value }))
    }

  const handleSiteUnitChange = (value: string) => {
    setSiteForm((prev) => ({ ...prev, measurementUnit: value }))
  }

  const handleTechnicianChange =
    (field: keyof typeof technicianForm) => (event: React.ChangeEvent<HTMLInputElement>) => {
      setTechnicianForm((prev) => ({ ...prev, [field]: event.target.value }))
    }

  const handleEquipmentStatus = (value: string) => {
    setEquipmentForm((prev) => ({ ...prev, isActive: value === "active" }))
  }

  const handleEquipmentOpenChange = (open: boolean) => {
    setEquipmentFormOpen(open)
    if (!open) {
      setEditingEquipmentId(null)
      resetEquipmentForm()
      if (breakdownNestedTarget === "equipment") {
        setBreakdownNestedTarget(null)
      }
    }
  }

  const handleBreakdownOpenChange = (open: boolean) => {
    setBreakdownFormOpen(open)
    if (!open) {
      resetBreakdownForm()
      setBreakdownNestedTarget(null)
    }
  }

  const handleSiteOpenChange = (open: boolean) => {
    setSiteFormOpen(open)
    if (!open) {
      resetSiteForm()
    }
  }

  const handleTechnicianOpenChange = (open: boolean) => {
    setTechnicianFormOpen(open)
    if (!open) {
      resetTechnicianForm()
      if (breakdownNestedTarget === "technician") {
        setBreakdownNestedTarget(null)
      }
    }
  }

  const createEquipmentMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) =>
      fetchJson("/api/equipment", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: (equipment) => {
      toast({
        title: "Equipment added",
        description: "Equipment saved to the register.",
        variant: "success",
      })
      if (breakdownNestedTarget === "equipment" && equipment?.id) {
        setBreakdownForm((prev) => ({ ...prev, equipmentId: equipment.id }))
        setBreakdownNestedTarget(null)
      }
      setEquipmentFormOpen(false)
      resetEquipmentForm()
      queryClient.invalidateQueries({ queryKey: ["equipment"] })
    },
    onError: (error) => {
      toast({
        title: "Unable to add equipment",
        description: getApiErrorMessage(error),
        variant: "destructive",
      })
    },
  })

  const updateEquipmentMutation = useMutation({
    mutationFn: async (payload: { id: string; data: Record<string, unknown> }) =>
      fetchJson(`/api/equipment/${payload.id}`, {
        method: "PATCH",
        body: JSON.stringify(payload.data),
      }),
    onSuccess: () => {
      toast({
        title: "Equipment updated",
        description: "Changes saved successfully.",
        variant: "success",
      })
      setEquipmentFormOpen(false)
      setEditingEquipmentId(null)
      resetEquipmentForm()
      queryClient.invalidateQueries({ queryKey: ["equipment"] })
    },
    onError: (error) => {
      toast({
        title: "Unable to update equipment",
        description: getApiErrorMessage(error),
        variant: "destructive",
      })
    },
  })

  const deleteEquipmentMutation = useMutation({
    mutationFn: async (id: string) => fetchJson(`/api/equipment/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({
        title: "Equipment deleted",
        description: "Equipment removed from the register.",
        variant: "success",
      })
      queryClient.invalidateQueries({ queryKey: ["equipment"] })
    },
    onError: (error) => {
      toast({
        title: "Unable to delete equipment",
        description: getApiErrorMessage(error),
        variant: "destructive",
      })
    },
  })

  const createSiteMutation = useMutation({
    mutationFn: async (payload: {
      name: string
      code: string
      location?: string
      measurementUnit?: string
    }) =>
      fetchJson("/api/sites", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: (site) => {
      toast({
        title: "Site added",
        description: "New site is ready for maintenance tracking.",
        variant: "success",
      })
      setSelectedSiteId(site.id)
      if (equipmentFormOpen) {
        setEquipmentForm((prev) => ({ ...prev, siteId: site.id }))
      }
      setSiteFormOpen(false)
      resetSiteForm()
      queryClient.invalidateQueries({ queryKey: ["sites"] })
    },
    onError: (error) => {
      toast({
        title: "Unable to add site",
        description: getApiErrorMessage(error),
        variant: "destructive",
      })
    },
  })

  const createTechnicianMutation = useMutation({
    mutationFn: async (payload: typeof technicianForm) =>
      fetchJson("/api/employees", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: (technician) => {
      toast({
        title: "Technician added",
        description: "Technician is now available for work orders.",
        variant: "success",
      })
      if (breakdownNestedTarget === "technician" && technician?.id) {
        setBreakdownForm((prev) => ({ ...prev, technicianId: technician.id }))
        setBreakdownNestedTarget(null)
      }
      setTechnicianFormOpen(false)
      resetTechnicianForm()
      queryClient.invalidateQueries({ queryKey: ["employees"] })
    },
    onError: (error) => {
      toast({
        title: "Unable to add technician",
        description: getApiErrorMessage(error),
        variant: "destructive",
      })
    },
  })

  const handleEquipmentSubmit = (event: React.FormEvent) => {
    event.preventDefault()

    if (!equipmentForm.equipmentCode || !equipmentForm.name || !equipmentForm.siteId) {
      toast({
        title: "Missing details",
        description: "Code, name, and site are required.",
        variant: "destructive",
      })
      return
    }

    const payload = {
      equipmentCode: equipmentForm.equipmentCode,
      name: equipmentForm.name,
      category: equipmentForm.category,
      siteId: equipmentForm.siteId,
      qrCode: equipmentForm.qrCode.trim() || undefined,
      lastServiceDate: equipmentForm.lastServiceDate || undefined,
      nextServiceDue: equipmentForm.nextServiceDue || undefined,
      serviceHours: toOptionalNumber(equipmentForm.serviceHours),
      serviceDays: toOptionalNumber(equipmentForm.serviceDays),
      isActive: equipmentForm.isActive,
    }

    if (editingEquipmentId) {
      updateEquipmentMutation.mutate({ id: editingEquipmentId, data: payload })
    } else {
      createEquipmentMutation.mutate(payload)
    }
  }

  const handleEquipmentDelete = (id: string) => {
    if (!window.confirm("Delete this equipment?")) return
    deleteEquipmentMutation.mutate(id)
  }

  const workOrderStatusInfo = (status: string) => {
    switch (status) {
      case "OPEN":
        return { label: "Open", variant: "destructive" as const }
      case "IN_PROGRESS":
        return { label: "In Progress", variant: "secondary" as const }
      case "COMPLETED":
        return { label: "Completed", variant: "default" as const }
      case "CANCELLED":
        return { label: "Cancelled", variant: "outline" as const }
      default:
        return { label: status, variant: "outline" as const }
    }
  }

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
      setBreakdownFormOpen(false)
      queryClient.invalidateQueries({ queryKey: ["work-orders"] })
      changeView("work-orders")
    },
    onError: (error) => {
      toast({
        title: "Unable to log breakdown",
        description: getApiErrorMessage(error),
        variant: "destructive",
      })
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

  const handleSiteSubmit = (event: React.FormEvent) => {
    event.preventDefault()

    if (!siteForm.name.trim() || !siteForm.code.trim()) {
      toast({
        title: "Missing details",
        description: "Site name and code are required.",
        variant: "destructive",
      })
      return
    }

    createSiteMutation.mutate({
      name: siteForm.name.trim(),
      code: siteForm.code.trim().toUpperCase(),
      location: siteForm.location.trim() || undefined,
      measurementUnit: siteForm.measurementUnit,
    })
  }

  const handleTechnicianSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    createTechnicianMutation.mutate(technicianForm)
  }

  const error =
    sitesError ||
    equipmentError ||
    workOrdersError ||
    employeesError ||
    createWorkOrderMutation.error

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <PageActions>
        <Button size="sm" onClick={() => { changeView("breakdown"); openBreakdownForm() }}>
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
                <div className="flex items-center gap-2">
                  <Button size="sm" onClick={openNewEquipmentForm}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Equipment
                  </Button>
                  <Button variant="outline" size="sm">
                    <Download className="h-4 w-4 mr-2" />
                    Export CSV
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="mb-4">
                {sitesLoading ? (
                  <Skeleton className="h-9 w-full" />
                ) : (
                  <Select value={activeSiteId} onValueChange={handleSiteFilterChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select site" />
                    </SelectTrigger>
                    <SelectContent>
                      {sites?.map((site) => (
                        <SelectItem key={site.id} value={site.id}>
                          {site.name}
                        </SelectItem>
                      ))}
                      <SelectSeparator />
                      <SelectItem
                        value="__add_site__"
                        className="sticky bottom-0 z-10 bg-popover font-medium text-primary"
                      >
                        + Add site
                      </SelectItem>
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
                      <th className="text-right p-3 text-sm font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {equipmentLoading ? (
                      <tr>
                        <td colSpan={9} className="p-3">
                          <Skeleton className="h-10 w-full" />
                        </td>
                      </tr>
                    ) : equipment.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="p-3 text-sm text-muted-foreground">
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
                            <td className="p-3 text-right">
                              <div className="flex justify-end gap-2">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={() => openEditEquipmentForm(item)}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => handleEquipmentDelete(item.id)}
                                  disabled={deleteEquipmentMutation.isPending}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>

              <Dialog open={equipmentFormOpen} onOpenChange={handleEquipmentOpenChange}>
                <DialogContent className="w-full sm:max-w-lg p-6">
                  <DialogHeader>
                    <DialogTitle>{editingEquipmentId ? "Edit Equipment" : "Add Equipment"}</DialogTitle>
                    <DialogDescription>Track equipment details and service windows.</DialogDescription>
                  </DialogHeader>
                  <form onSubmit={handleEquipmentSubmit} className="mt-6 space-y-4">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label className="block text-sm font-medium mb-2">Equipment Code *</label>
                        <Input
                          value={equipmentForm.equipmentCode}
                          onChange={handleEquipmentChange("equipmentCode")}
                          placeholder="EQ-001"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2">Name *</label>
                        <Input
                          value={equipmentForm.name}
                          onChange={handleEquipmentChange("name")}
                          placeholder="Crusher 1"
                          required
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label className="block text-sm font-medium mb-2">Category *</label>
                        <Select
                          value={equipmentForm.category}
                          onValueChange={handleEquipmentSelect("category")}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select category" />
                          </SelectTrigger>
                          <SelectContent>
                            {equipmentCategories.map((category) => (
                              <SelectItem key={category} value={category}>
                                {category}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2">Site *</label>
                        {sitesLoading ? (
                          <Skeleton className="h-9 w-full" />
                        ) : (
                          <Select
                            value={equipmentForm.siteId || undefined}
                            onValueChange={handleEquipmentSiteSelect}
                          >
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="Select site" />
                            </SelectTrigger>
                            <SelectContent>
                              {sites?.map((site) => (
                                <SelectItem key={site.id} value={site.id}>
                                  {site.name}
                                </SelectItem>
                              ))}
                              <SelectSeparator />
                              <SelectItem
                                value="__add_site__"
                                className="sticky bottom-0 z-10 bg-popover font-medium text-primary"
                              >
                                + Add site
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-2">QR Code</label>
                      <Input
                        value={equipmentForm.qrCode}
                        onChange={handleEquipmentChange("qrCode")}
                        placeholder="Optional"
                      />
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label className="block text-sm font-medium mb-2">Last Service</label>
                        <Input
                          type="date"
                          value={equipmentForm.lastServiceDate}
                          onChange={handleEquipmentChange("lastServiceDate")}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2">Next Service Due</label>
                        <Input
                          type="date"
                          value={equipmentForm.nextServiceDue}
                          onChange={handleEquipmentChange("nextServiceDue")}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label className="block text-sm font-medium mb-2">Service Hours</label>
                        <Input
                          type="number"
                          min="0"
                          value={equipmentForm.serviceHours}
                          onChange={handleEquipmentChange("serviceHours")}
                          placeholder="0"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2">Service Days</label>
                        <Input
                          type="number"
                          min="0"
                          value={equipmentForm.serviceDays}
                          onChange={handleEquipmentChange("serviceDays")}
                          placeholder="0"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-2">Status</label>
                      <Select
                        value={equipmentForm.isActive ? "active" : "inactive"}
                        onValueChange={handleEquipmentStatus}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="active">Active</SelectItem>
                          <SelectItem value="inactive">Inactive</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Button
                        type="submit"
                        className="flex-1"
                        disabled={
                          createEquipmentMutation.isPending || updateEquipmentMutation.isPending
                        }
                      >
                        {editingEquipmentId ? "Save Changes" : "Save Equipment"}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => handleEquipmentOpenChange(false)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="work-orders" className="mt-0">
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle>Work Orders</CardTitle>
                  <CardDescription>Current breakdowns and maintenance tasks</CardDescription>
                </div>
                <div className="w-full sm:w-64">
                  {sitesLoading ? (
                    <Skeleton className="h-9 w-full" />
                  ) : (
                    <Select value={activeSiteId} onValueChange={handleSiteFilterChange}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select site" />
                      </SelectTrigger>
                      <SelectContent>
                        {sites?.map((site) => (
                          <SelectItem key={site.id} value={site.id}>
                            {site.name}
                          </SelectItem>
                        ))}
                        <SelectSeparator />
                        <SelectItem
                          value="__add_site__"
                          className="sticky bottom-0 z-10 bg-popover font-medium text-primary"
                        >
                          + Add site
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-muted">
                    <tr>
                      <th className="text-left p-3 text-sm font-medium">Equipment</th>
                      <th className="text-left p-3 text-sm font-medium">Issue</th>
                      <th className="text-left p-3 text-sm font-medium">Technician</th>
                      <th className="text-left p-3 text-sm font-medium">Status</th>
                      <th className="text-left p-3 text-sm font-medium">Started</th>
                      <th className="text-right p-3 text-sm font-medium">Downtime</th>
                    </tr>
                  </thead>
                  <tbody>
                    {workOrdersLoading ? (
                      <tr>
                        <td colSpan={6} className="p-3">
                          <Skeleton className="h-10 w-full" />
                        </td>
                      </tr>
                    ) : workOrders.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-3 text-sm text-muted-foreground">
                          No work orders logged for this site.
                        </td>
                      </tr>
                    ) : (
                      workOrders.map((order) => {
                        const statusInfo = workOrderStatusInfo(order.status)
                        return (
                          <tr key={order.id} className="border-b hover:bg-muted/60">
                            <td className="p-3 text-sm">
                              <div className="font-medium">{order.equipment.name}</div>
                              <div className="text-xs text-muted-foreground">
                                {order.equipment.equipmentCode} | {order.equipment.site.code}
                              </div>
                            </td>
                            <td className="p-3 text-sm">{order.issue}</td>
                            <td className="p-3 text-sm">{order.technician?.name || "-"}</td>
                            <td className="p-3 text-sm">
                              <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                            </td>
                            <td className="p-3 text-sm">{formatDateTime(order.downtimeStart)}</td>
                            <td className="p-3 text-sm text-right">
                              {getDowntimeHours(order.downtimeStart, order.downtimeEnd)}h
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

        <TabsContent value="breakdown" className="mt-0">
          <Card>
            <CardHeader>
              <CardTitle>Log Breakdown</CardTitle>
              <CardDescription>Capture equipment downtime and create a work order.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-muted-foreground">
                  Use the breakdown form to log failures and assign technicians.
                </p>
                <Button size="sm" onClick={openBreakdownForm}>
                  <Plus className="h-4 w-4 mr-2" />
                  Log Breakdown
                </Button>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <Card className="border-dashed">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold">Open Work Orders</CardTitle>
                    <CardDescription className="text-xs">Awaiting technician action</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-semibold">{openWorkOrders}</div>
                  </CardContent>
                </Card>
                <Card className="border-dashed">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold">Equipment Down</CardTitle>
                    <CardDescription className="text-xs">Currently out of service</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-semibold">{downCount}</div>
                  </CardContent>
                </Card>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="schedule" className="mt-0">
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle>PM Schedule</CardTitle>
                  <CardDescription>Upcoming preventive maintenance windows</CardDescription>
                </div>
                <div className="w-full sm:w-64">
                  {sitesLoading ? (
                    <Skeleton className="h-9 w-full" />
                  ) : (
                    <Select value={activeSiteId} onValueChange={handleSiteFilterChange}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select site" />
                      </SelectTrigger>
                      <SelectContent>
                        {sites?.map((site) => (
                          <SelectItem key={site.id} value={site.id}>
                            {site.name}
                          </SelectItem>
                        ))}
                        <SelectSeparator />
                        <SelectItem
                          value="__add_site__"
                          className="sticky bottom-0 z-10 bg-popover font-medium text-primary"
                        >
                          + Add site
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-muted">
                    <tr>
                      <th className="text-left p-3 text-sm font-medium">Equipment</th>
                      <th className="text-left p-3 text-sm font-medium">Category</th>
                      <th className="text-left p-3 text-sm font-medium">Site</th>
                      <th className="text-left p-3 text-sm font-medium">Due Date</th>
                      <th className="text-right p-3 text-sm font-medium">Days Left</th>
                    </tr>
                  </thead>
                  <tbody>
                    {equipmentLoading ? (
                      <tr>
                        <td colSpan={5} className="p-3">
                          <Skeleton className="h-10 w-full" />
                        </td>
                      </tr>
                    ) : upcomingMaintenance.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="p-3 text-sm text-muted-foreground">
                          No upcoming maintenance within the next 90 days.
                        </td>
                      </tr>
                    ) : (
                      upcomingMaintenance.map((item) => (
                        <tr key={item.equipment.id} className="border-b hover:bg-muted/60">
                          <td className="p-3 text-sm">
                            <div className="font-medium">{item.equipment.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {item.equipment.equipmentCode}
                            </div>
                          </td>
                          <td className="p-3 text-sm">{item.equipment.category}</td>
                          <td className="p-3 text-sm">{item.equipment.site.code}</td>
                          <td className="p-3 text-sm">{item.dueDate}</td>
                          <td className="p-3 text-sm text-right">
                            <Badge variant={item.daysUntil < 14 ? "destructive" : "secondary"}>
                              {item.daysUntil} days
                            </Badge>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={breakdownFormOpen} onOpenChange={handleBreakdownOpenChange}>
        <DialogContent className="w-full sm:max-w-lg p-6">
          <DialogHeader>
            <DialogTitle>Log Breakdown</DialogTitle>
            <DialogDescription>Record downtime and create a work order.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleBreakdownSubmit} className="mt-6 space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium mb-2">Site *</label>
                {sitesLoading ? (
                  <Skeleton className="h-9 w-full" />
                ) : (
                  <Select value={activeSiteId} onValueChange={handleSiteFilterChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select site" />
                    </SelectTrigger>
                    <SelectContent>
                      {sites?.map((site) => (
                        <SelectItem key={site.id} value={site.id}>
                          {site.name}
                        </SelectItem>
                      ))}
                      <SelectSeparator />
                      <SelectItem
                        value="__add_site__"
                        className="sticky bottom-0 z-10 bg-popover font-medium text-primary"
                      >
                        + Add site
                      </SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Equipment *</label>
                {equipmentLoading ? (
                  <Skeleton className="h-9 w-full" />
                ) : (
                  <Select
                    value={breakdownForm.equipmentId || undefined}
                    onValueChange={handleBreakdownEquipmentSelect}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select equipment" />
                    </SelectTrigger>
                    <SelectContent>
                      {equipment.map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                          {item.name} ({item.equipmentCode})
                        </SelectItem>
                      ))}
                      <SelectSeparator />
                      <SelectItem
                        value="__add_equipment__"
                        className="sticky bottom-0 z-10 bg-popover font-medium text-primary"
                      >
                        + Add equipment
                      </SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Issue *</label>
              <Textarea
                value={breakdownForm.issue}
                onChange={(event) =>
                  setBreakdownForm((prev) => ({ ...prev, issue: event.target.value }))
                }
                placeholder="Describe the issue"
                rows={3}
                required
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium mb-2">Downtime Start *</label>
                <Input
                  type="datetime-local"
                  value={breakdownForm.downtimeStart}
                  onChange={(event) =>
                    setBreakdownForm((prev) => ({ ...prev, downtimeStart: event.target.value }))
                  }
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Technician</label>
                {employeesLoading ? (
                  <Skeleton className="h-9 w-full" />
                ) : (
                  <Select
                    value={breakdownForm.technicianId || undefined}
                    onValueChange={handleBreakdownTechnicianSelect}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Assign technician" />
                    </SelectTrigger>
                    <SelectContent>
                      {technicians.map((technician) => (
                        <SelectItem key={technician.id} value={technician.id}>
                          {technician.name} ({technician.employeeId})
                        </SelectItem>
                      ))}
                      <SelectSeparator />
                      <SelectItem
                        value="__add_technician__"
                        className="sticky bottom-0 z-10 bg-popover font-medium text-primary"
                      >
                        + Add technician
                      </SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button type="submit" className="flex-1" disabled={createWorkOrderMutation.isPending}>
                {createWorkOrderMutation.isPending ? "Saving..." : "Create Work Order"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleBreakdownOpenChange(false)}
              >
                Cancel
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={siteFormOpen} onOpenChange={handleSiteOpenChange}>
        <DialogContent className="w-full sm:max-w-lg p-6">
          <DialogHeader>
            <DialogTitle>Add Site</DialogTitle>
            <DialogDescription>Create a new site for maintenance tracking.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSiteSubmit} className="mt-6 space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium mb-2">Site Name *</label>
                <Input
                  value={siteForm.name}
                  onChange={handleSiteFormChange("name")}
                  placeholder="Mine Site"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Site Code *</label>
                <Input
                  value={siteForm.code}
                  onChange={handleSiteFormChange("code")}
                  placeholder="SITE-01"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Location</label>
              <Input
                value={siteForm.location}
                onChange={handleSiteFormChange("location")}
                placeholder="Location details"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Measurement Unit</label>
              <Select value={siteForm.measurementUnit} onValueChange={handleSiteUnitChange}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select unit" />
                </SelectTrigger>
                <SelectContent>
                  {measurementUnits.map((unit) => (
                    <SelectItem key={unit} value={unit}>
                      {unit}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button type="submit" className="flex-1" disabled={createSiteMutation.isPending}>
                {createSiteMutation.isPending ? "Saving..." : "Save Site"}
              </Button>
              <Button type="button" variant="outline" onClick={() => handleSiteOpenChange(false)}>
                Cancel
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={technicianFormOpen} onOpenChange={handleTechnicianOpenChange}>
        <DialogContent className="w-full sm:max-w-lg p-6">
          <DialogHeader>
            <DialogTitle>Add Technician</DialogTitle>
            <DialogDescription>Capture technician details for work orders.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleTechnicianSubmit} className="mt-6 space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium mb-2">Name *</label>
                <Input
                  value={technicianForm.name}
                  onChange={handleTechnicianChange("name")}
                  placeholder="Full name"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Phone *</label>
                <Input
                  type="tel"
                  value={technicianForm.phone}
                  onChange={handleTechnicianChange("phone")}
                  placeholder="07xx xxx xxx"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium mb-2">Next of Kin Name *</label>
                <Input
                  value={technicianForm.nextOfKinName}
                  onChange={handleTechnicianChange("nextOfKinName")}
                  placeholder="Next of kin"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Next of Kin Phone *</label>
                <Input
                  type="tel"
                  value={technicianForm.nextOfKinPhone}
                  onChange={handleTechnicianChange("nextOfKinPhone")}
                  placeholder="07xx xxx xxx"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium mb-2">Village of Origin *</label>
                <Input
                  value={technicianForm.villageOfOrigin}
                  onChange={handleTechnicianChange("villageOfOrigin")}
                  placeholder="Village"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Passport Photo URL *</label>
                <Input
                  type="url"
                  value={technicianForm.passportPhotoUrl}
                  onChange={handleTechnicianChange("passportPhotoUrl")}
                  placeholder="https://"
                  required
                />
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                type="submit"
                className="flex-1"
                disabled={createTechnicianMutation.isPending}
              >
                {createTechnicianMutation.isPending ? "Saving..." : "Save Technician"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleTechnicianOpenChange(false)}
              >
                Cancel
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
