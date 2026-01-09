"use client"

import Link from "next/link"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { ArrowLeft, Package, Fuel, AlertTriangle, Plus, Download, TrendingUp, TrendingDown, Minus } from "lucide-react"

// Mock data
const mockInventory = [
  { id: "1", code: "FUEL-001", name: "Diesel", category: "FUEL", unit: "litres", currentStock: 450, minStock: 500, maxStock: 2000, location: "Main Store", unitCost: 1.65, status: "low" },
  { id: "2", code: "SPARE-012", name: "Crusher Jaw Plates", category: "SPARES", unit: "pieces", currentStock: 4, minStock: 2, maxStock: 10, location: "Workshop", unitCost: 450, status: "ok" },
  { id: "3", code: "CONS-008", name: "Grinding Media (Balls)", category: "CONSUMABLES", unit: "kg", currentStock: 180, minStock: 200, maxStock: 1000, location: "Mill Store", unitCost: 2.5, status: "low" },
  { id: "4", code: "PPE-015", name: "Safety Helmets", category: "PPE", unit: "pieces", currentStock: 25, minStock: 15, maxStock: 50, location: "Main Store", unitCost: 12, status: "ok" },
  { id: "5", code: "REAG-003", name: "Cyanide (NaCN)", category: "REAGENTS", unit: "kg", currentStock: 85, minStock: 50, maxStock: 200, location: "Secure Store", unitCost: 8.5, status: "ok" },
  { id: "6", code: "SPARE-024", name: "Pump Impellers", category: "SPARES", unit: "pieces", currentStock: 1, minStock: 3, maxStock: 10, location: "Workshop", unitCost: 180, status: "critical" },
]

const mockFuelLedger = [
  { date: "2026-01-08", type: "issue", equipment: "Generator 1", quantity: 120, opening: 570, closing: 450, requestedBy: "Night Shift", approvedBy: "Site Manager" },
  { date: "2026-01-07", type: "receipt", supplier: "Delta Fuels", quantity: 1500, opening: -930, closing: 570, receivedBy: "Stores Clerk", invoiceNo: "INV-2401" },
  { date: "2026-01-07", type: "issue", equipment: "Crusher", quantity: 85, opening: 15, closing: -930, requestedBy: "Day Shift", approvedBy: "Site Manager" },
  { date: "2026-01-06", type: "issue", equipment: "Haul Trucks", quantity: 150, opening: 165, closing: 15, requestedBy: "Day Shift", approvedBy: "Supervisor" },
]

const mockRecentMovements = [
  { id: "1", item: "Grinding Media (Balls)", type: "issue", quantity: 50, unit: "kg", issuedTo: "Mill Section", requestedBy: "J. Moyo", timestamp: "2026-01-08 14:30" },
  { id: "2", item: "Diesel", type: "issue", quantity: 120, unit: "litres", issuedTo: "Generator 1", requestedBy: "Night Shift", timestamp: "2026-01-08 06:00" },
  { id: "3", item: "Safety Helmets", type: "issue", quantity: 3, unit: "pieces", issuedTo: "New Hires", requestedBy: "HR", timestamp: "2026-01-07 10:15" },
  { id: "4", item: "Diesel", type: "receipt", quantity: 1500, unit: "litres", issuedTo: "Main Store", requestedBy: "Stores Clerk", timestamp: "2026-01-07 09:00" },
]

export default function StoresPage() {
  const [activeView, setActiveView] = useState<"dashboard" | "inventory" | "fuel" | "issue" | "receive">("dashboard")
  const [selectedSite, setSelectedSite] = useState("site1")
  const [selectedCategory, setSelectedCategory] = useState("all")

  // Filter inventory
  const filteredInventory = mockInventory.filter(item => 
    selectedCategory === "all" || item.category === selectedCategory
  )

  // Calculate stats
  const totalItems = mockInventory.length
  const lowStockItems = mockInventory.filter(item => item.status === "low" || item.status === "critical").length
  const totalValue = mockInventory.reduce((sum, item) => sum + (item.currentStock * item.unitCost), 0)

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-orange-600 text-white shadow-lg">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Link href="/">
              <Button variant="ghost" className="text-white hover:bg-orange-700 p-2">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-xl md:text-2xl font-bold">Stores & Fuel Management</h1>
              <p className="text-orange-100 text-sm">Inventory tracking and fuel ledger</p>
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
            className={activeView === "dashboard" ? "bg-orange-600 hover:bg-orange-700" : ""}
          >
            <Package className="h-4 w-4 mr-2" />
            Dashboard
          </Button>
          <Button
            onClick={() => setActiveView("inventory")}
            variant={activeView === "inventory" ? "default" : "outline"}
            className={activeView === "inventory" ? "bg-orange-600 hover:bg-orange-700" : ""}
          >
            Stock on Hand
          </Button>
          <Button
            onClick={() => setActiveView("fuel")}
            variant={activeView === "fuel" ? "default" : "outline"}
            className={activeView === "fuel" ? "bg-orange-600 hover:bg-orange-700" : ""}
          >
            <Fuel className="h-4 w-4 mr-2" />
            Fuel Ledger
          </Button>
          <Button
            onClick={() => setActiveView("issue")}
            variant={activeView === "issue" ? "default" : "outline"}
            className={activeView === "issue" ? "bg-orange-600 hover:bg-orange-700" : ""}
          >
            <Minus className="h-4 w-4 mr-2" />
            Issue Stock
          </Button>
          <Button
            onClick={() => setActiveView("receive")}
            variant={activeView === "receive" ? "default" : "outline"}
            className={activeView === "receive" ? "bg-orange-600 hover:bg-orange-700" : ""}
          >
            <Plus className="h-4 w-4 mr-2" />
            Receive Stock
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
                      <p className="text-sm text-gray-600">Total Items</p>
                      <p className="text-2xl font-bold">{totalItems}</p>
                    </div>
                    <Package className="h-10 w-10 text-orange-600 opacity-50" />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-600">Low Stock Alerts</p>
                      <p className="text-2xl font-bold text-red-600">{lowStockItems}</p>
                    </div>
                    <AlertTriangle className="h-10 w-10 text-red-600 opacity-50" />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-600">Inventory Value</p>
                      <p className="text-2xl font-bold">${totalValue.toLocaleString()}</p>
                    </div>
                    <TrendingUp className="h-10 w-10 text-green-600 opacity-50" />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-600">Diesel Stock</p>
                      <p className="text-2xl font-bold">450L</p>
                      <p className="text-xs text-red-600">Below minimum</p>
                    </div>
                    <Fuel className="h-10 w-10 text-orange-600 opacity-50" />
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Reorder Alerts */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-red-600" />
                  Reorder Alerts
                </CardTitle>
                <CardDescription>Items below minimum stock levels</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {mockInventory.filter(item => item.status === "low" || item.status === "critical").map(item => (
                    <div key={item.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div>
                        <div className="font-medium">{item.name}</div>
                        <div className="text-sm text-gray-600">
                          Current: {item.currentStock} {item.unit} | Min: {item.minStock} {item.unit}
                        </div>
                      </div>
                      <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                        item.status === "critical" ? "bg-red-100 text-red-800" : "bg-yellow-100 text-yellow-800"
                      }`}>
                        {item.status === "critical" ? "Critical" : "Low"}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Recent Movements */}
            <Card>
              <CardHeader>
                <CardTitle>Recent Stock Movements</CardTitle>
                <CardDescription>Last 4 transactions</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {mockRecentMovements.map(movement => (
                    <div key={movement.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-3">
                        {movement.type === "issue" ? (
                          <TrendingDown className="h-5 w-5 text-red-600" />
                        ) : (
                          <TrendingUp className="h-5 w-5 text-green-600" />
                        )}
                        <div>
                          <div className="font-medium">{movement.item}</div>
                          <div className="text-sm text-gray-600">
                            {movement.type === "issue" ? "Issued to" : "Received to"}: {movement.issuedTo} | By: {movement.requestedBy}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={`font-medium ${movement.type === "issue" ? "text-red-600" : "text-green-600"}`}>
                          {movement.type === "issue" ? "-" : "+"}{movement.quantity} {movement.unit}
                        </div>
                        <div className="text-xs text-gray-500">{movement.timestamp}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Inventory View */}
        {activeView === "inventory" && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Stock on Hand</CardTitle>
                  <CardDescription>Current inventory across all locations</CardDescription>
                </div>
                <Button variant="outline" size="sm">
                  <Download className="h-4 w-4 mr-2" />
                  Export CSV
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {/* Filters */}
              <div className="flex gap-4 mb-4">
                <Select value={selectedSite} onChange={(e) => setSelectedSite(e.target.value)}>
                  <option value="site1">Mine Site 1</option>
                  <option value="site2">Mine Site 2</option>
                  <option value="site3">Mine Site 3</option>
                </Select>
                <Select value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)}>
                  <option value="all">All Categories</option>
                  <option value="FUEL">Fuel</option>
                  <option value="SPARES">Spares</option>
                  <option value="CONSUMABLES">Consumables</option>
                  <option value="PPE">PPE</option>
                  <option value="REAGENTS">Reagents</option>
                </Select>
              </div>

              {/* Inventory Table */}
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="text-left p-3 text-sm font-medium">Code</th>
                      <th className="text-left p-3 text-sm font-medium">Item Name</th>
                      <th className="text-left p-3 text-sm font-medium">Category</th>
                      <th className="text-right p-3 text-sm font-medium">Current Stock</th>
                      <th className="text-right p-3 text-sm font-medium">Min</th>
                      <th className="text-left p-3 text-sm font-medium">Location</th>
                      <th className="text-right p-3 text-sm font-medium">Value</th>
                      <th className="text-center p-3 text-sm font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredInventory.map(item => (
                      <tr key={item.id} className="border-b hover:bg-gray-50">
                        <td className="p-3 text-sm font-mono">{item.code}</td>
                        <td className="p-3 text-sm font-medium">{item.name}</td>
                        <td className="p-3 text-sm">{item.category}</td>
                        <td className="p-3 text-sm text-right font-medium">
                          {item.currentStock} {item.unit}
                        </td>
                        <td className="p-3 text-sm text-right text-gray-600">
                          {item.minStock} {item.unit}
                        </td>
                        <td className="p-3 text-sm">{item.location}</td>
                        <td className="p-3 text-sm text-right">
                          ${(item.currentStock * item.unitCost).toFixed(2)}
                        </td>
                        <td className="p-3 text-center">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                            item.status === "critical" ? "bg-red-100 text-red-800" :
                            item.status === "low" ? "bg-yellow-100 text-yellow-800" :
                            "bg-green-100 text-green-800"
                          }`}>
                            {item.status === "critical" ? "Critical" : item.status === "low" ? "Low" : "OK"}
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

        {/* Fuel Ledger View */}
        {activeView === "fuel" && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Fuel className="h-5 w-5 text-orange-600" />
                    Fuel Ledger
                  </CardTitle>
                  <CardDescription>Diesel receipts and issues with running balance</CardDescription>
                </div>
                <Button variant="outline" size="sm">
                  <Download className="h-4 w-4 mr-2" />
                  Export PDF
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {/* Current Balance */}
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 mb-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Current Diesel Stock</p>
                    <p className="text-3xl font-bold text-orange-600">450 litres</p>
                    <p className="text-sm text-red-600 mt-1">⚠️ Below minimum level (500L)</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-gray-600">Variance</p>
                    <p className="text-xl font-medium text-red-600">-50 L</p>
                  </div>
                </div>
              </div>

              {/* Fuel Ledger Table */}
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="text-left p-3 text-sm font-medium">Date</th>
                      <th className="text-left p-3 text-sm font-medium">Type</th>
                      <th className="text-left p-3 text-sm font-medium">Equipment/Supplier</th>
                      <th className="text-right p-3 text-sm font-medium">Quantity</th>
                      <th className="text-right p-3 text-sm font-medium">Opening</th>
                      <th className="text-right p-3 text-sm font-medium">Closing</th>
                      <th className="text-left p-3 text-sm font-medium">Authorized By</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mockFuelLedger.map((entry, index) => (
                      <tr key={index} className="border-b hover:bg-gray-50">
                        <td className="p-3 text-sm">{entry.date}</td>
                        <td className="p-3 text-sm">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                            entry.type === "receipt" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
                          }`}>
                            {entry.type === "receipt" ? "Receipt" : "Issue"}
                          </span>
                        </td>
                        <td className="p-3 text-sm">
                          {entry.type === "receipt" ? entry.supplier : entry.equipment}
                        </td>
                        <td className={`p-3 text-sm text-right font-medium ${
                          entry.type === "receipt" ? "text-green-600" : "text-red-600"
                        }`}>
                          {entry.type === "receipt" ? "+" : "-"}{entry.quantity}L
                        </td>
                        <td className="p-3 text-sm text-right">{entry.opening}L</td>
                        <td className="p-3 text-sm text-right font-medium">{entry.closing}L</td>
                        <td className="p-3 text-sm">
                          {entry.type === "receipt" ? entry.receivedBy : entry.approvedBy}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Issue Stock Form */}
        {activeView === "issue" && (
          <Card>
            <CardHeader>
              <CardTitle>Issue Stock</CardTitle>
              <CardDescription>Issue items to equipment or sections</CardDescription>
            </CardHeader>
            <CardContent>
              <form className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Date *</label>
                    <Input type="date" defaultValue={new Date().toISOString().split('T')[0]} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Site *</label>
                    <Select>
                      <option>Mine Site 1</option>
                      <option>Mine Site 2</option>
                      <option>Mine Site 3</option>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Item *</label>
                    <Select>
                      <option value="">Select item...</option>
                      {mockInventory.map(item => (
                        <option key={item.id} value={item.id}>
                          {item.name} ({item.currentStock} {item.unit} available)
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Quantity *</label>
                    <Input type="number" placeholder="e.g., 50" />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Issued To (Equipment/Section) *</label>
                    <Input placeholder="e.g., Generator 1, Mill Section" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Requested By *</label>
                    <Input placeholder="Name or shift" />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Approved By</label>
                  <Input placeholder="Supervisor or manager name" />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Notes</label>
                  <Textarea placeholder="Additional information about this issue..." rows={3} />
                </div>

                <div className="flex gap-3">
                  <Button className="bg-orange-600 hover:bg-orange-700">
                    Submit Issue
                  </Button>
                  <Button variant="outline" onClick={() => setActiveView("dashboard")}>
                    Cancel
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Receive Stock Form */}
        {activeView === "receive" && (
          <Card>
            <CardHeader>
              <CardTitle>Receive Stock</CardTitle>
              <CardDescription>Record new stock receipts</CardDescription>
            </CardHeader>
            <CardContent>
              <form className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Date *</label>
                    <Input type="date" defaultValue={new Date().toISOString().split('T')[0]} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Site *</label>
                    <Select>
                      <option>Mine Site 1</option>
                      <option>Mine Site 2</option>
                      <option>Mine Site 3</option>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Item *</label>
                    <Select>
                      <option value="">Select item...</option>
                      {mockInventory.map(item => (
                        <option key={item.id} value={item.id}>
                          {item.name} (Current: {item.currentStock} {item.unit})
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Quantity *</label>
                    <Input type="number" placeholder="e.g., 1500" />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Supplier *</label>
                    <Input placeholder="Supplier name" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Invoice/Delivery Number</label>
                    <Input placeholder="e.g., INV-2401" />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Unit Cost</label>
                    <Input type="number" step="0.01" placeholder="Cost per unit" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Received By *</label>
                    <Input placeholder="Your name" />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Notes</label>
                  <Textarea placeholder="Delivery notes, condition, etc..." rows={3} />
                </div>

                <div className="flex gap-3">
                  <Button className="bg-green-600 hover:bg-green-700">
                    <Plus className="h-4 w-4 mr-2" />
                    Submit Receipt
                  </Button>
                  <Button variant="outline" onClick={() => setActiveView("dashboard")}>
                    Cancel
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  )
}
