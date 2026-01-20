"use client"

import { useState } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { PageActions } from "@/components/layout/page-actions"
import { PageHeading } from "@/components/layout/page-heading"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Wrench, AlertTriangle, Calendar, CheckCircle, Clock, QrCode, Plus, Download } from "lucide-react"

const maintenanceViews = ["dashboard", "equipment", "work-orders", "breakdown", "schedule"] as const
type MaintenanceView = (typeof maintenanceViews)[number]

// Mock data
const mockEquipment = [
  { 
    id: "1", 
    code: "CRUSH-001", 
    name: "Primary Crusher", 
    category: "CRUSHER", 
    site: "Mine Site 1", 
    status: "operational", 
    lastService: "2025-12-15", 
    nextService: "2026-03-15",
    serviceHours: 1200,
    qrCode: "QR-CRUSH-001"
  },
  { 
    id: "2", 
    code: "MILL-002", 
    name: "Ball Mill #1", 
    category: "MILL", 
    site: "Mine Site 1", 
    status: "needs-service", 
    lastService: "2025-11-20", 
    nextService: "2026-01-15",
    serviceHours: 2400,
    qrCode: "QR-MILL-002"
  },
  { 
    id: "3", 
    code: "PUMP-005", 
    name: "Dewatering Pump #3", 
    category: "PUMP", 
    site: "Mine Site 1", 
    status: "down", 
    lastService: "2025-12-01", 
    nextService: "2026-04-01",
    serviceHours: 800,
    qrCode: "QR-PUMP-005"
  },
  { 
    id: "4", 
    code: "GEN-001", 
    name: "Generator 1", 
    category: "GENERATOR", 
    site: "Mine Site 1", 
    status: "operational", 
    lastService: "2026-01-05", 
    nextService: "2026-04-05",
    serviceHours: 500,
    qrCode: "QR-GEN-001"
  },
  { 
    id: "5", 
    code: "TRUCK-003", 
    name: "Haul Truck #3", 
    category: "VEHICLE", 
    site: "Mine Site 1", 
    status: "operational", 
    lastService: "2025-12-20", 
    nextService: "2026-02-20",
    serviceHours: 1800,
    qrCode: "QR-TRUCK-003"
  },
]

const mockWorkOrders = [
  {
    id: "WO-001",
    equipment: "Dewatering Pump #3",
    equipmentCode: "PUMP-005",
    issue: "Pump not priming - possible impeller damage",
    status: "open",
    priority: "high",
    downtimeStart: "2026-01-08 06:00",
    downtimeHours: 14,
    reportedBy: "Night Shift Supervisor",
    assignedTo: "Maintenance Team",
    createdAt: "2026-01-08"
  },
  {
    id: "WO-002",
    equipment: "Ball Mill #1",
    equipmentCode: "MILL-002",
    issue: "Scheduled service - bearing replacement",
    status: "in-progress",
    priority: "medium",
    downtimeStart: "2026-01-07 08:00",
    downtimeHours: 6,
    reportedBy: "Maintenance Manager",
    assignedTo: "J. Sibanda",
    workDone: "Removed worn bearings, cleaning shaft",
    partsUsed: "Bearings (x2), Grease",
    createdAt: "2026-01-07"
  },
  {
    id: "WO-003",
    equipment: "Primary Crusher",
    equipmentCode: "CRUSH-001",
    issue: "Belt misalignment causing vibration",
    status: "completed",
    priority: "medium",
    downtimeStart: "2026-01-05 14:00",
    downtimeEnd: "2026-01-05 16:30",
    downtimeHours: 2.5,
    reportedBy: "Day Shift Operator",
    assignedTo: "T. Moyo",
    workDone: "Adjusted belt tension and alignment, tested operation",
    partsUsed: "None",
    completedAt: "2026-01-05",
    createdAt: "2026-01-05"
  },
]

const mockUpcomingMaintenance = [
  { equipment: "Ball Mill #1", dueDate: "2026-01-15", daysUntil: 7, type: "Scheduled Service" },
  { equipment: "Haul Truck #3", dueDate: "2026-02-20", daysUntil: 43, type: "Scheduled Service" },
  { equipment: "Primary Crusher", dueDate: "2026-03-15", daysUntil: 66, type: "Scheduled Service" },
]

export default function MaintenancePage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const viewParam = searchParams.get("view")
  const initialView = maintenanceViews.includes(viewParam as MaintenanceView)
    ? (viewParam as MaintenanceView)
    : "dashboard"
  const [activeView, setActiveView] = useState<MaintenanceView>(initialView)
  const [selectedSite, setSelectedSite] = useState("site1")

  const changeView = (view: MaintenanceView) => {
    setActiveView(view)
    const params = new URLSearchParams(searchParams.toString())
    params.set("view", view)
    router.replace(`/maintenance?${params.toString()}`)
  }

  // Calculate stats
  const totalEquipment = mockEquipment.length
  const operationalCount = mockEquipment.filter(e => e.status === "operational").length
  const downCount = mockEquipment.filter(e => e.status === "down").length
  const openWorkOrders = mockWorkOrders.filter(wo => wo.status === "open" || wo.status === "in-progress").length
  const activeWorkOrders = mockWorkOrders.filter(wo => wo.status !== "completed")
  const highPriorityWorkOrders = activeWorkOrders.filter(wo => wo.priority === "high").length
  const upcomingMaintenanceCount = mockUpcomingMaintenance.length
  const nextPmDue = upcomingMaintenanceCount
    ? Math.min(...mockUpcomingMaintenance.map(item => item.daysUntil))
    : null

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

      <PageHeading title="Maintenance Management" description="Equipment tracking and work orders" />

        {/* Navigation Tabs */}
        <Card className="mb-4 py-3">
          <CardContent className="flex flex-wrap gap-2 py-3">
            <Button
              onClick={() => changeView("dashboard")}
              size="sm"
              variant={activeView === "dashboard" ? "default" : "outline"}
              className="min-h-0 min-w-0 h-8 px-2"
            >
              <Wrench className="h-4 w-4" />
              Dashboard
            </Button>
            <Button
              onClick={() => changeView("equipment")}
              size="sm"
              variant={activeView === "equipment" ? "default" : "outline"}
              className="min-h-0 min-w-0 h-8 px-2"
            >
              Equipment Register
            </Button>
            <Button
              onClick={() => changeView("work-orders")}
              size="sm"
              variant={activeView === "work-orders" ? "default" : "outline"}
              className="min-h-0 min-w-0 h-8 px-2"
            >
              Work Orders
            </Button>
            <Button
              onClick={() => changeView("breakdown")}
              size="sm"
              variant={activeView === "breakdown" ? "default" : "outline"}
              className="min-h-0 min-w-0 h-8 px-2"
            >
              <Plus className="h-4 w-4" />
              Log Breakdown
            </Button>
            <Button
              onClick={() => changeView("schedule")}
              size="sm"
              variant={activeView === "schedule" ? "default" : "outline"}
              className="min-h-0 min-w-0 h-8 px-2"
            >
              <Calendar className="h-4 w-4" />
              PM Schedule
            </Button>
          </CardContent>
        </Card>

        {/* Dashboard View */}
        {activeView === "dashboard" && (
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <Card className="py-4 gap-3">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold">Equipment Status</CardTitle>
                  <CardDescription className="text-xs">Live availability snapshot</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="min-h-0 min-w-0 h-8 w-full justify-between px-2"
                  >
                    <div className="flex items-center gap-2 text-left">
                      <Wrench className="h-4 w-4 text-muted-foreground" />
                      <span className="text-xs">Total Equipment</span>
                    </div>
                    <span className="text-sm font-semibold">{totalEquipment}</span>
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="min-h-0 min-w-0 h-8 w-full justify-between px-2"
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
                    className="min-h-0 min-w-0 h-8 w-full justify-between px-2"
                  >
                    <div className="flex items-center gap-2 text-left">
                      <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                      <span className="text-xs">Equipment Down</span>
                    </div>
                    <span className="text-sm font-semibold text-destructive">{downCount}</span>
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
                    className="min-h-0 min-w-0 h-8 w-full justify-between px-2"
                  >
                    <div className="flex items-center gap-2 text-left">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <span className="text-xs">Active Work Orders</span>
                    </div>
                    <span className="text-sm font-semibold">{openWorkOrders}</span>
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="min-h-0 min-w-0 h-8 w-full justify-between px-2"
                  >
                    <div className="flex items-center gap-2 text-left">
                      <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                      <span className="text-xs">High Priority</span>
                    </div>
                    <span className="text-sm font-semibold">{highPriorityWorkOrders}</span>
                  </Button>
                </CardContent>
              </Card>

              <Card className="py-4 gap-3">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold">Preventive Maintenance</CardTitle>
                  <CardDescription className="text-xs">Scheduled services</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="min-h-0 min-w-0 h-8 w-full justify-between px-2"
                  >
                    <div className="flex items-center gap-2 text-left">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <span className="text-xs">Upcoming (90 days)</span>
                    </div>
                    <span className="text-sm font-semibold">{upcomingMaintenanceCount}</span>
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="min-h-0 min-w-0 h-8 w-full justify-between px-2"
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
                  <CardDescription className="text-xs">Open and in-progress tasks</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-2">
                  {activeWorkOrders.length === 0 ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="min-h-0 min-w-0 h-8 w-full justify-between px-2"
                      disabled
                    >
                      No active work orders
                    </Button>
                  ) : (
                    activeWorkOrders.map(wo => (
                      <Button
                        key={wo.id}
                        type="button"
                        variant="outline"
                        size="sm"
                        className="min-h-0 min-w-0 h-auto w-full items-start justify-between gap-3 whitespace-normal px-2 py-1.5"
                      >
                        <div className="flex flex-col items-start gap-1 text-left">
                          <span className="text-sm font-medium">{wo.equipment}</span>
                          <span className="text-xs text-muted-foreground">{wo.issue}</span>
                          <span className="text-xs text-muted-foreground">
                            {wo.equipmentCode} | {wo.id}
                          </span>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <Badge variant={wo.status === "open" ? "destructive" : "secondary"}>
                            {wo.status === "open" ? "Open" : "In Progress"}
                          </Badge>
                          <Badge
                            variant={
                              wo.priority === "high"
                                ? "destructive"
                                : wo.priority === "medium"
                                  ? "secondary"
                                  : "outline"
                            }
                          >
                            {wo.priority.toUpperCase()}
                          </Badge>
                          <span className="text-xs text-muted-foreground">{wo.downtimeHours}h</span>
                        </div>
                      </Button>
                    ))
                  )}
                </CardContent>
              </Card>

              <Card className="py-4 gap-3">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold">Upcoming Maintenance</CardTitle>
                  <CardDescription className="text-xs">Scheduled in the next 90 days</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-2">
                  {mockUpcomingMaintenance.map((item, index) => (
                      <Button
                        key={index}
                        type="button"
                        variant="outline"
                        size="sm"
                        className="min-h-0 min-w-0 h-auto w-full items-start justify-between gap-3 whitespace-normal px-2 py-1.5"
                      >
                        <div className="flex flex-col items-start text-left">
                          <span className="text-sm font-medium">{item.equipment}</span>
                        <span className="text-xs text-muted-foreground">{item.type}</span>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span className="text-xs font-medium">{item.dueDate}</span>
                        <Badge variant={item.daysUntil < 14 ? "destructive" : "secondary"}>
                          {item.daysUntil} days
                        </Badge>
                      </div>
                    </Button>
                  ))}
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {/* Equipment Register View */}
        {activeView === "equipment" && (
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
              {/* Filter */}
              <div className="mb-4">
                <Select value={selectedSite} onValueChange={setSelectedSite}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select site" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="site1">Mine Site 1</SelectItem>
                    <SelectItem value="site2">Mine Site 2</SelectItem>
                    <SelectItem value="site3">Mine Site 3</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Equipment Table */}
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
                    {mockEquipment.map(equipment => (
                      <tr key={equipment.id} className="border-b hover:bg-muted/60">
                        <td className="p-3 text-sm font-mono">{equipment.code}</td>
                        <td className="p-3 text-sm font-medium">{equipment.name}</td>
                        <td className="p-3 text-sm">{equipment.category}</td>
                        <td className="p-3 text-sm">
                          <Button variant="ghost" size="sm" className="gap-2">
                            <QrCode className="h-4 w-4" />
                            {equipment.qrCode}
                          </Button>
                        </td>
                        <td className="p-3 text-sm">{equipment.lastService}</td>
                        <td className="p-3 text-sm">{equipment.nextService}</td>
                        <td className="p-3 text-sm text-right font-medium">{equipment.serviceHours}h</td>
                        <td className="p-3 text-center">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                            equipment.status === "operational" ? "bg-green-100 text-green-800" :
                            equipment.status === "down" ? "bg-red-100 text-red-800" :
                            "bg-yellow-100 text-yellow-800"
                          }`}>
                            {equipment.status === "operational" ? "Operational" :
                             equipment.status === "down" ? "Down" :
                             "Needs Service"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Work Orders View */}
        {activeView === "work-orders" && (
          <Card>
            <CardHeader>
              <CardTitle>All Work Orders</CardTitle>
              <CardDescription>Complete maintenance history</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {mockWorkOrders.map(wo => (
                  <div key={wo.id} className="border rounded-lg p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <div className="font-medium text-lg">{wo.equipment}</div>
                        <div className="text-sm text-muted-foreground">{wo.equipmentCode} | {wo.id}</div>
                      </div>
                      <div className="flex gap-2">
                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                          wo.status === "completed" ? "bg-green-100 text-green-800" :
                          wo.status === "open" ? "bg-red-100 text-red-800" : 
                          "bg-yellow-100 text-yellow-800"
                        }`}>
                          {wo.status === "completed" ? "Completed" : wo.status === "open" ? "Open" : "In Progress"}
                        </span>
                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                          wo.priority === "high" ? "bg-red-100 text-red-800" : 
                          wo.priority === "medium" ? "bg-orange-100 text-orange-800" : 
                          "bg-blue-100 text-blue-800"
                        }`}>
                          {wo.priority.toUpperCase()}
                        </span>
                      </div>
                    </div>
                    <div className="mb-3">
                      <div className="text-sm font-medium mb-1">Issue:</div>
                      <div className="text-sm">{wo.issue}</div>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <div className="text-muted-foreground">Reported By</div>
                        <div className="font-medium">{wo.reportedBy}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Assigned To</div>
                        <div className="font-medium">{wo.assignedTo}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Downtime</div>
                        <div className="font-medium">{wo.downtimeHours}h</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Created</div>
                        <div className="font-medium">{wo.createdAt}</div>
                      </div>
                    </div>
                    {wo.workDone && (
                      <div className="mt-3 p-3 bg-muted/60 rounded">
                        <div className="text-sm font-medium mb-1">Work Done:</div>
                        <div className="text-sm">{wo.workDone}</div>
                        {wo.partsUsed && (
                          <div className="text-sm text-muted-foreground mt-1">Parts Used: {wo.partsUsed}</div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Log Breakdown Form */}
        {activeView === "breakdown" && (
          <Card>
            <CardHeader>
              <CardTitle>Log Equipment Breakdown</CardTitle>
              <CardDescription>Create new work order for equipment issue</CardDescription>
            </CardHeader>
            <CardContent>
              <form className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Site *</label>
                    <Select defaultValue="site1">
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select site" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="site1">Mine Site 1</SelectItem>
                        <SelectItem value="site2">Mine Site 2</SelectItem>
                        <SelectItem value="site3">Mine Site 3</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Equipment *</label>
                    <Select>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select equipment..." />
                      </SelectTrigger>
                      <SelectContent>
                        {mockEquipment.map(eq => (
                          <SelectItem key={eq.id} value={eq.id}>
                            {eq.name} ({eq.code})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Issue Description *</label>
                  <Textarea 
                    placeholder="Describe the problem in detail..." 
                    rows={3}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Downtime Started *</label>
                    <Input type="datetime-local" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Priority *</label>
                    <Select defaultValue="high">
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select priority" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="high">High - Production stopped</SelectItem>
                        <SelectItem value="medium">Medium - Reduced capacity</SelectItem>
                        <SelectItem value="low">Low - No immediate impact</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Reported By *</label>
                    <Input placeholder="Your name or shift" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Assign To</label>
                    <Select>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select technician..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="team">Maintenance Team</SelectItem>
                        <SelectItem value="j-sibanda">J. Sibanda</SelectItem>
                        <SelectItem value="t-moyo">T. Moyo</SelectItem>
                        <SelectItem value="external">External Contractor</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Additional Notes</label>
                  <Textarea placeholder="Any additional information..." rows={2} />
                </div>

                <div className="flex gap-3">
                  <Button className="bg-red-600 hover:bg-red-700">
                    <Plus className="h-4 w-4 mr-2" />
                    Create Work Order
                  </Button>
                  <Button variant="outline" onClick={() => changeView("dashboard")}>
                    Cancel
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {/* PM Schedule View */}
        {activeView === "schedule" && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-blue-600" />
                Preventive Maintenance Schedule
              </CardTitle>
              <CardDescription>Upcoming scheduled maintenance for all equipment</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {mockEquipment.map(equipment => (
                  <div key={equipment.id} className="border rounded-lg p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <div className="font-medium text-lg">{equipment.name}</div>
                        <div className="text-sm text-muted-foreground">{equipment.code} | {equipment.category}</div>
                      </div>
                      <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                        equipment.status === "operational" ? "bg-green-100 text-green-800" :
                        equipment.status === "down" ? "bg-red-100 text-red-800" :
                        "bg-yellow-100 text-yellow-800"
                      }`}>
                        {equipment.status === "operational" ? "Operational" :
                         equipment.status === "down" ? "Down" :
                         "Needs Service"}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <div className="text-muted-foreground">Last Service</div>
                        <div className="font-medium">{equipment.lastService}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Next Service</div>
                        <div className="font-medium">{equipment.nextService}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Service Hours</div>
                        <div className="font-medium">{equipment.serviceHours}h</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Days Until Service</div>
                        <div className="font-medium">
                          {Math.floor((new Date(equipment.nextService).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))} days
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
    </div>
  )
}
