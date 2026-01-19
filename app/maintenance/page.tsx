"use client"

import Link from "next/link"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { ArrowLeft, Wrench, AlertTriangle, Calendar, CheckCircle, Clock, QrCode, Plus, Download } from "lucide-react"

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
  const [activeView, setActiveView] = useState<"dashboard" | "equipment" | "work-orders" | "breakdown" | "schedule">("dashboard")
  const [selectedSite, setSelectedSite] = useState("site1")

  // Calculate stats
  const totalEquipment = mockEquipment.length
  const operationalCount = mockEquipment.filter(e => e.status === "operational").length
  const downCount = mockEquipment.filter(e => e.status === "down").length
  const openWorkOrders = mockWorkOrders.filter(wo => wo.status === "open" || wo.status === "in-progress").length

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-red-600 text-white shadow-lg">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Link href="/">
              <Button variant="ghost" className="text-white hover:bg-red-700 p-2">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-xl md:text-2xl font-bold">Maintenance Management</h1>
              <p className="text-red-100 text-sm">Equipment tracking and work orders</p>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-7xl">
        {/* Navigation Tabs */}
        <div className="flex flex-wrap gap-2 mb-6">
          <Button
            onClick={() => setActiveView("dashboard")}
            variant={activeView === "dashboard" ? "default" : "outline"}
            className={activeView === "dashboard" ? "bg-red-600 hover:bg-red-700" : ""}
          >
            <Wrench className="h-4 w-4 mr-2" />
            Dashboard
          </Button>
          <Button
            onClick={() => setActiveView("equipment")}
            variant={activeView === "equipment" ? "default" : "outline"}
            className={activeView === "equipment" ? "bg-red-600 hover:bg-red-700" : ""}
          >
            Equipment Register
          </Button>
          <Button
            onClick={() => setActiveView("work-orders")}
            variant={activeView === "work-orders" ? "default" : "outline"}
            className={activeView === "work-orders" ? "bg-red-600 hover:bg-red-700" : ""}
          >
            Work Orders
          </Button>
          <Button
            onClick={() => setActiveView("breakdown")}
            variant={activeView === "breakdown" ? "default" : "outline"}
            className={activeView === "breakdown" ? "bg-red-600 hover:bg-red-700" : ""}
          >
            <Plus className="h-4 w-4 mr-2" />
            Log Breakdown
          </Button>
          <Button
            onClick={() => setActiveView("schedule")}
            variant={activeView === "schedule" ? "default" : "outline"}
            className={activeView === "schedule" ? "bg-red-600 hover:bg-red-700" : ""}
          >
            <Calendar className="h-4 w-4 mr-2" />
            PM Schedule
          </Button>
        </div>

        {/* Dashboard View */}
        {activeView === "dashboard" && (
          <div className="space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-600">Total Equipment</p>
                      <p className="text-2xl font-bold">{totalEquipment}</p>
                    </div>
                    <Wrench className="h-10 w-10 text-red-600 opacity-50" />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-600">Operational</p>
                      <p className="text-2xl font-bold text-green-600">{operationalCount}</p>
                    </div>
                    <CheckCircle className="h-10 w-10 text-green-600 opacity-50" />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-600">Equipment Down</p>
                      <p className="text-2xl font-bold text-red-600">{downCount}</p>
                    </div>
                    <AlertTriangle className="h-10 w-10 text-red-600 opacity-50" />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-600">Open Work Orders</p>
                      <p className="text-2xl font-bold">{openWorkOrders}</p>
                    </div>
                    <Clock className="h-10 w-10 text-orange-600 opacity-50" />
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Active Work Orders */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5 text-orange-600" />
                  Active Work Orders
                </CardTitle>
                <CardDescription>Open and in-progress maintenance tasks</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {mockWorkOrders.filter(wo => wo.status !== "completed").map(wo => (
                    <div key={wo.id} className="border rounded-lg p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <div className="font-medium text-lg">{wo.equipment}</div>
                          <div className="text-sm text-gray-600">{wo.equipmentCode} | {wo.id}</div>
                        </div>
                        <div className="flex gap-2">
                          <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                            wo.status === "open" ? "bg-red-100 text-red-800" : "bg-yellow-100 text-yellow-800"
                          }`}>
                            {wo.status === "open" ? "Open" : "In Progress"}
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
                      <div className="text-sm mb-2">{wo.issue}</div>
                      <div className="grid grid-cols-2 gap-4 text-sm text-gray-600">
                        <div>Downtime: <span className="font-medium">{wo.downtimeHours}h</span></div>
                        <div>Assigned: <span className="font-medium">{wo.assignedTo}</span></div>
                      </div>
                      {wo.workDone && (
                        <div className="mt-3 p-3 bg-gray-50 rounded text-sm">
                          <div className="font-medium mb-1">Work Done:</div>
                          <div>{wo.workDone}</div>
                          {wo.partsUsed && <div className="mt-1 text-gray-600">Parts: {wo.partsUsed}</div>}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Upcoming Maintenance */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-blue-600" />
                  Upcoming Preventive Maintenance
                </CardTitle>
                <CardDescription>Scheduled services in next 90 days</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {mockUpcomingMaintenance.map((item, index) => (
                    <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                      <div>
                        <div className="font-medium">{item.equipment}</div>
                        <div className="text-sm text-gray-600">{item.type}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-medium">{item.dueDate}</div>
                        <div className={`text-xs ${
                          item.daysUntil < 14 ? "text-red-600" : "text-gray-600"
                        }`}>
                          {item.daysUntil} days
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
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
                <Select value={selectedSite} onChange={(e) => setSelectedSite(e.target.value)}>
                  <option value="site1">Mine Site 1</option>
                  <option value="site2">Mine Site 2</option>
                  <option value="site3">Mine Site 3</option>
                </Select>
              </div>

              {/* Equipment Table */}
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-100">
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
                      <tr key={equipment.id} className="border-b hover:bg-gray-50">
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
                        <div className="text-sm text-gray-600">{wo.equipmentCode} | {wo.id}</div>
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
                        <div className="text-gray-600">Reported By</div>
                        <div className="font-medium">{wo.reportedBy}</div>
                      </div>
                      <div>
                        <div className="text-gray-600">Assigned To</div>
                        <div className="font-medium">{wo.assignedTo}</div>
                      </div>
                      <div>
                        <div className="text-gray-600">Downtime</div>
                        <div className="font-medium">{wo.downtimeHours}h</div>
                      </div>
                      <div>
                        <div className="text-gray-600">Created</div>
                        <div className="font-medium">{wo.createdAt}</div>
                      </div>
                    </div>
                    {wo.workDone && (
                      <div className="mt-3 p-3 bg-gray-50 rounded">
                        <div className="text-sm font-medium mb-1">Work Done:</div>
                        <div className="text-sm">{wo.workDone}</div>
                        {wo.partsUsed && (
                          <div className="text-sm text-gray-600 mt-1">Parts Used: {wo.partsUsed}</div>
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
                    <Select>
                      <option>Mine Site 1</option>
                      <option>Mine Site 2</option>
                      <option>Mine Site 3</option>
                    </Select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Equipment *</label>
                    <Select>
                      <option value="">Select equipment...</option>
                      {mockEquipment.map(eq => (
                        <option key={eq.id} value={eq.id}>
                          {eq.name} ({eq.code})
                        </option>
                      ))}
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
                    <Select>
                      <option value="high">High - Production stopped</option>
                      <option value="medium">Medium - Reduced capacity</option>
                      <option value="low">Low - No immediate impact</option>
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
                      <option value="">Select technician...</option>
                      <option>Maintenance Team</option>
                      <option>J. Sibanda</option>
                      <option>T. Moyo</option>
                      <option>External Contractor</option>
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
                  <Button variant="outline" onClick={() => setActiveView("dashboard")}>
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
                        <div className="text-sm text-gray-600">{equipment.code} | {equipment.category}</div>
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
                        <div className="text-gray-600">Last Service</div>
                        <div className="font-medium">{equipment.lastService}</div>
                      </div>
                      <div>
                        <div className="text-gray-600">Next Service</div>
                        <div className="font-medium">{equipment.nextService}</div>
                      </div>
                      <div>
                        <div className="text-gray-600">Service Hours</div>
                        <div className="font-medium">{equipment.serviceHours}h</div>
                      </div>
                      <div>
                        <div className="text-gray-600">Days Until Service</div>
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
      </main>
    </div>
  )
}
