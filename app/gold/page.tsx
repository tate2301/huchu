"use client"

import { useState } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { PageActions } from "@/components/layout/page-actions"
import { PageHeading } from "@/components/layout/page-heading"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Coins, Send, Shield, Package, FileCheck } from "lucide-react"

const goldViews = ["menu", "pour", "dispatch", "receipt", "reconciliation", "audit"] as const
type ViewMode = (typeof goldViews)[number]

// Mock data for demonstration
const mockPours = [
  { id: 'PB-123456', date: '2026-01-08', site: 'Mine Site 1', weight: 45.5, status: 'dispatched' },
  { id: 'PB-123457', date: '2026-01-07', site: 'Mine Site 2', weight: 38.2, status: 'in-storage' },
  { id: 'PB-123458', date: '2026-01-06', site: 'Mine Site 1', weight: 52.1, status: 'received' },
]

const mockAuditLog = [
  { timestamp: '2026-01-08 14:30', action: 'Pour Recorded', user: 'John Doe', details: 'PB-123456, 45.5g' },
  { timestamp: '2026-01-08 15:45', action: 'Dispatch Created', user: 'Sarah Smith', details: 'PB-123456 to Buyer A' },
  { timestamp: '2026-01-08 18:20', action: 'Receipt Confirmed', user: 'Mike Johnson', details: 'Assay: 42.3g pure' },
  { timestamp: '2026-01-07 10:15', action: 'Pour Recorded', user: 'John Doe', details: 'PB-123457, 38.2g' },
]

export default function GoldPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const viewParam = searchParams.get("view")
  const initialView = goldViews.includes(viewParam as ViewMode)
    ? (viewParam as ViewMode)
    : "menu"
  const [viewMode, setViewMode] = useState<ViewMode>(initialView)
  const viewDescription = {
    menu: "Security-critical operations",
    pour: "Record Pour",
    dispatch: "Dispatch Manifest",
    receipt: "Buyer Receipt",
    reconciliation: "Reconciliation",
    audit: "Audit Trail",
  }[viewMode]
  const changeView = (view: ViewMode) => {
    setViewMode(view)
    const params = new URLSearchParams(searchParams.toString())
    params.set("view", view)
    router.replace(`/gold?${params.toString()}`)
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <PageActions>
        <Button size="sm" onClick={() => changeView("pour")}>
          <Coins className="h-4 w-4" />
          Record Pour
        </Button>
        <Button size="sm" variant="outline" onClick={() => changeView("dispatch")}>
          <Package className="h-4 w-4" />
          Dispatch
        </Button>
      </PageActions>

      <PageHeading title="Gold Control" description={viewDescription} />

      <div className="space-y-6">
        {viewMode === "menu" && <GoldMenu setViewMode={changeView} />}
        {viewMode === "pour" && <PourForm setViewMode={changeView} />}
        {viewMode === "dispatch" && <DispatchForm setViewMode={changeView} />}
        {viewMode === "receipt" && <ReceiptForm setViewMode={changeView} />}
        {viewMode === "reconciliation" && <ReconciliationView setViewMode={changeView} />}
        {viewMode === "audit" && <AuditTrail setViewMode={changeView} />}
      </div>
    </div>
  )
}

function GoldMenu({ setViewMode }: { setViewMode: (mode: ViewMode) => void }) {
  return (
    <div className="space-y-6">
      {/* Warning Banner */}
      <Card className="bg-yellow-50 border-yellow-300">
        <CardContent className="pt-6">
          <div className="flex gap-3">
            <Shield className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm">
              <strong className="block mb-1">High-Security Module</strong>
              <p className="text-foreground">
                All gold operations require 2-person witness rule and create immutable audit trails.
                Corrections require approval, not silent edits.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card 
          className="cursor-pointer hover:shadow-lg transition-shadow"
          onClick={() => setViewMode('pour')}
        >
          <CardHeader>
            <Coins className="h-10 w-10 text-yellow-600 mb-2" />
            <CardTitle>Record Pour</CardTitle>
            <CardDescription>
              Create new gold pour/bar record with witnesses
            </CardDescription>
          </CardHeader>
        </Card>

        <Card 
          className="cursor-pointer hover:shadow-lg transition-shadow"
          onClick={() => setViewMode('dispatch')}
        >
          <CardHeader>
            <Package className="h-10 w-10 text-blue-600 mb-2" />
            <CardTitle>Dispatch</CardTitle>
            <CardDescription>
              Create dispatch manifest and chain of custody
            </CardDescription>
          </CardHeader>
        </Card>

        <Card 
          className="cursor-pointer hover:shadow-lg transition-shadow"
          onClick={() => setViewMode('receipt')}
        >
          <CardHeader>
            <FileCheck className="h-10 w-10 text-green-600 mb-2" />
            <CardTitle>Buyer Receipt</CardTitle>
            <CardDescription>
              Record buyer assay and payment confirmation
            </CardDescription>
          </CardHeader>
        </Card>

        <Card 
          className="cursor-pointer hover:shadow-lg transition-shadow"
          onClick={() => setViewMode('reconciliation')}
        >
          <CardHeader>
            <Shield className="h-10 w-10 text-purple-600 mb-2" />
            <CardTitle>Reconciliation</CardTitle>
            <CardDescription>
              View pour → dispatch → receipt → payment trail
            </CardDescription>
          </CardHeader>
        </Card>
      </div>

      {/* Recent Activity */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Recent Activity</CardTitle>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => setViewMode('audit')}
            >
              View Audit Log
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {mockPours.length === 0 ? (
            <div className="text-center text-muted-foreground py-6">
              <p className="text-sm">No gold operations recorded yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {mockPours.slice(0, 3).map((pour) => (
                <div key={pour.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div>
                    <div className="font-medium">{pour.id}</div>
                    <div className="text-sm text-muted-foreground">{pour.site} • {pour.weight}g</div>
                  </div>
                  <div className={`px-2 py-1 rounded text-xs font-medium ${
                    pour.status === 'received' ? 'bg-green-100 text-green-800' :
                    pour.status === 'dispatched' ? 'bg-blue-100 text-blue-800' :
                    'bg-yellow-100 text-yellow-800'
                  }`}>
                    {pour.status}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function PourForm({ setViewMode }: { setViewMode: (mode: ViewMode) => void }) {
  const [formData, setFormData] = useState({
    pourBarId: `PB-${Date.now().toString().slice(-6)}`,
    pourDate: new Date().toISOString().slice(0, 16),
    site: '',
    grossWeight: '',
    estimatedPurity: '',
    witness1: '',
    witness2: '',
    storageLocation: '',
    notes: '',
  })

  const handleSelectChange = (field: keyof typeof formData) => (value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    console.log('Pour recorded:', formData)
    alert('Pour recorded successfully!\n\nIn production:\n- Immutable record created\n- Witnesses notified\n- Audit log entry added')
    setViewMode('menu')
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Button 
        type="button"
        variant="outline" 
        onClick={() => setViewMode('menu')}
      >
        ← Back to Menu
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>Pour Details</CardTitle>
          <CardDescription>All fields required for gold pour record</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">Pour/Bar ID *</label>
              <Input
                value={formData.pourBarId}
                onChange={(e) => setFormData({...formData, pourBarId: e.target.value})}
                required
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-2">Pour Date/Time *</label>
              <Input
                type="datetime-local"
                value={formData.pourDate}
                onChange={(e) => setFormData({...formData, pourDate: e.target.value})}
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Site *</label>
            <Select
              name="site"
              value={formData.site || undefined}
              onValueChange={handleSelectChange("site")}
              required
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select site..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="site1">Mine Site 1</SelectItem>
                <SelectItem value="site2">Mine Site 2</SelectItem>
                <SelectItem value="site3">Mine Site 3</SelectItem>
                <SelectItem value="site4">Mine Site 4</SelectItem>
                <SelectItem value="site5">Mine Site 5</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">Gross Weight (grams) *</label>
              <Input
                type="number"
                step="0.01"
                value={formData.grossWeight}
                onChange={(e) => setFormData({...formData, grossWeight: e.target.value})}
                required
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-2">Estimated Purity (%)</label>
              <Input
                type="number"
                step="0.01"
                max="100"
                value={formData.estimatedPurity}
                onChange={(e) => setFormData({...formData, estimatedPurity: e.target.value})}
                placeholder="Optional"
              />
            </div>
          </div>

          <div className="border-t pt-4">
            <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
              <Shield className="h-4 w-4 text-yellow-600" />
              2-Person Witness Rule
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Witness 1 *</label>
                <Input
                  value={formData.witness1}
                  onChange={(e) => setFormData({...formData, witness1: e.target.value})}
                  placeholder="Full name"
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-2">Witness 2 *</label>
                <Input
                  value={formData.witness2}
                  onChange={(e) => setFormData({...formData, witness2: e.target.value})}
                  placeholder="Full name"
                  required
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Storage Location *</label>
            <Input
              value={formData.storageLocation}
              onChange={(e) => setFormData({...formData, storageLocation: e.target.value})}
              placeholder="e.g., Safe 1, Vault A"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Notes</label>
            <Textarea
              value={formData.notes}
              onChange={(e) => setFormData({...formData, notes: e.target.value})}
              rows={2}
              placeholder="Additional observations..."
            />
          </div>
        </CardContent>
      </Card>

      <Button type="submit" className="w-full" size="lg">
        <Send className="mr-2 h-5 w-5" />
        Record Pour (Immutable)
      </Button>
    </form>
  )
}

function DispatchForm({ setViewMode }: { setViewMode: (mode: ViewMode) => void }) {
  const [formData, setFormData] = useState({
    dispatchId: `DS-${Date.now().toString().slice(-6)}`,
    pourBarId: '',
    dispatchDate: new Date().toISOString().slice(0, 16),
    courier: '',
    vehicle: '',
    destination: '',
    sealNumbers: '',
    handedOverBy: '',
    receivedBy: '',
    notes: '',
  })

  const handleSelectChange = (field: keyof typeof formData) => (value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    console.log('Dispatch recorded:', formData)
    alert('Dispatch manifest created successfully!\n\nChain of custody established.\nBoth parties notified.')
    setViewMode('menu')
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Button 
        type="button"
        variant="outline" 
        onClick={() => setViewMode('menu')}
      >
        ← Back to Menu
      </Button>

      <Card className="bg-blue-50 border-blue-200">
        <CardContent className="pt-6">
          <div className="flex gap-3">
            <Shield className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm">
              <strong className="block mb-1">Chain of Custody</strong>
              <p className="text-foreground">
                This manifest creates an immutable record of gold transfer. Both sender and receiver signatures required.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Dispatch Details</CardTitle>
          <CardDescription>All fields required for dispatch manifest</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">Dispatch ID *</label>
              <Input
                value={formData.dispatchId}
                onChange={(e) => setFormData({...formData, dispatchId: e.target.value})}
                required
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-2">Pour/Bar ID *</label>
              <Select
                name="pourBarId"
                value={formData.pourBarId || undefined}
                onValueChange={handleSelectChange("pourBarId")}
                required
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select pour..." />
                </SelectTrigger>
                <SelectContent>
                  {mockPours.filter(p => p.status === 'in-storage').map(p => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.id} ({p.weight}g)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Dispatch Date/Time *</label>
            <Input
              type="datetime-local"
              value={formData.dispatchDate}
              onChange={(e) => setFormData({...formData, dispatchDate: e.target.value})}
              required
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">Courier/Company *</label>
              <Input
                value={formData.courier}
                onChange={(e) => setFormData({...formData, courier: e.target.value})}
                placeholder="e.g., SecureTransit Ltd"
                required
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-2">Vehicle/Registration</label>
              <Input
                value={formData.vehicle}
                onChange={(e) => setFormData({...formData, vehicle: e.target.value})}
                placeholder="e.g., ABC-1234"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Destination *</label>
            <Input
              value={formData.destination}
              onChange={(e) => setFormData({...formData, destination: e.target.value})}
              placeholder="Buyer name and address"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Seal Numbers *</label>
            <Input
              value={formData.sealNumbers}
              onChange={(e) => setFormData({...formData, sealNumbers: e.target.value})}
              placeholder="e.g., S-12345, S-12346"
              required
            />
          </div>

          <div className="border-t pt-4">
            <h4 className="text-sm font-medium mb-3">Handover Details</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Handed Over By *</label>
                <Input
                  value={formData.handedOverBy}
                  onChange={(e) => setFormData({...formData, handedOverBy: e.target.value})}
                  placeholder="Your name"
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-2">Received By</label>
                <Input
                  value={formData.receivedBy}
                  onChange={(e) => setFormData({...formData, receivedBy: e.target.value})}
                  placeholder="Courier name"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Notes</label>
            <Textarea
              value={formData.notes}
              onChange={(e) => setFormData({...formData, notes: e.target.value})}
              rows={2}
              placeholder="Additional dispatch notes..."
            />
          </div>
        </CardContent>
      </Card>

      <Button type="submit" className="w-full" size="lg">
        <Send className="mr-2 h-5 w-5" />
        Create Dispatch Manifest
      </Button>
    </form>
  )
}

function ReceiptForm({ setViewMode }: { setViewMode: (mode: ViewMode) => void }) {
  const [formData, setFormData] = useState({
    receiptNumber: '',
    dispatchId: '',
    receiptDate: new Date().toISOString().slice(0, 16),
    assayResult: '',
    paidAmount: '',
    paymentMethod: 'BANK_TRANSFER',
    paymentChannel: '',
    paymentReference: '',
    notes: '',
  })

  const handleSelectChange = (field: keyof typeof formData) => (value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    console.log('Receipt recorded:', formData)
    alert('Buyer receipt recorded successfully!\n\nReconciliation complete.\nPayment confirmed.')
    setViewMode('menu')
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Button 
        type="button"
        variant="outline" 
        onClick={() => setViewMode('menu')}
      >
        ← Back to Menu
      </Button>

      <Card className="bg-green-50 border-green-200">
        <CardContent className="pt-6">
          <div className="flex gap-3">
            <Shield className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm">
              <strong className="block mb-1">Payment Confirmation</strong>
              <p className="text-foreground">
                Record final assay results and payment details to complete the gold transaction cycle.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Buyer Receipt</CardTitle>
          <CardDescription>Record assay and payment confirmation</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">Receipt Number *</label>
              <Input
                value={formData.receiptNumber}
                onChange={(e) => setFormData({...formData, receiptNumber: e.target.value})}
                placeholder="e.g., RCP-2026-001"
                required
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-2">Dispatch ID *</label>
              <Select
                name="dispatchId"
                value={formData.dispatchId || undefined}
                onValueChange={handleSelectChange("dispatchId")}
                required
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select dispatch..." />
                </SelectTrigger>
                <SelectContent>
                  {mockPours.filter(p => p.status === 'dispatched').map(p => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.id} ({p.weight}g)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Receipt Date *</label>
            <Input
              type="datetime-local"
              value={formData.receiptDate}
              onChange={(e) => setFormData({...formData, receiptDate: e.target.value})}
              required
            />
          </div>

          <div className="border-t pt-4">
            <h4 className="text-sm font-medium mb-3">Assay Results</h4>
            <div>
              <label className="block text-sm font-medium mb-2">Actual Purity/Fine Weight (grams) *</label>
              <Input
                type="number"
                step="0.01"
                value={formData.assayResult}
                onChange={(e) => setFormData({...formData, assayResult: e.target.value})}
                placeholder="e.g., 42.35"
                required
              />
              <p className="text-xs text-muted-foreground mt-1">After buyer's assay test</p>
            </div>
          </div>

          <div className="border-t pt-4">
            <h4 className="text-sm font-medium mb-3">Payment Details</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Payment Amount (USD) *</label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.paidAmount}
                  onChange={(e) => setFormData({...formData, paidAmount: e.target.value})}
                  placeholder="0.00"
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-2">Payment Method *</label>
                <Select
                  name="paymentMethod"
                  value={formData.paymentMethod}
                  onValueChange={handleSelectChange("paymentMethod")}
                  required
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select method" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="BANK_TRANSFER">Bank Transfer</SelectItem>
                    <SelectItem value="CASH">Cash</SelectItem>
                    <SelectItem value="MOBILE_MONEY">Mobile Money</SelectItem>
                    <SelectItem value="CRYPTO">Cryptocurrency</SelectItem>
                    <SelectItem value="CHECK">Check</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
              <div>
                <label className="block text-sm font-medium mb-2">Payment Channel</label>
                <Input
                  value={formData.paymentChannel}
                  onChange={(e) => setFormData({...formData, paymentChannel: e.target.value})}
                  placeholder="e.g., Standard Bank, EcoCash"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-2">Payment Reference</label>
                <Input
                  value={formData.paymentReference}
                  onChange={(e) => setFormData({...formData, paymentReference: e.target.value})}
                  placeholder="Transaction ID or reference"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Notes</label>
            <Textarea
              value={formData.notes}
              onChange={(e) => setFormData({...formData, notes: e.target.value})}
              rows={2}
              placeholder="Additional payment notes..."
            />
          </div>
        </CardContent>
      </Card>

      <Button type="submit" className="w-full" size="lg">
        <Send className="mr-2 h-5 w-5" />
        Confirm Receipt & Payment
      </Button>
    </form>
  )
}

function ReconciliationView({ setViewMode }: { setViewMode: (mode: ViewMode) => void }) {
  return (
    <div className="space-y-6">
      <Button variant="outline" onClick={() => setViewMode('menu')}>
        ← Back to Menu
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>Gold Reconciliation</CardTitle>
          <CardDescription>Complete chain: Pour → Dispatch → Receipt → Payment</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {mockPours.map((pour) => (
              <div key={pour.id} className="border rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="font-semibold">{pour.id}</div>
                  <div className={`px-2 py-1 rounded text-xs font-medium ${
                    pour.status === 'received' ? 'bg-green-100 text-green-800' :
                    pour.status === 'dispatched' ? 'bg-blue-100 text-blue-800' :
                    'bg-yellow-100 text-yellow-800'
                  }`}>
                    {pour.status}
                  </div>
                </div>

                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-green-500"></div>
                    <span className="font-medium">Pour:</span>
                    <span className="text-muted-foreground">{pour.date} • {pour.site} • {pour.weight}g</span>
                  </div>

                  {pour.status !== 'in-storage' && (
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                      <span className="font-medium">Dispatch:</span>
                      <span className="text-muted-foreground">Courier: SecureTransit • Seals: S-12345</span>
                    </div>
                  )}

                  {pour.status === 'received' && (
                    <>
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-purple-500"></div>
                        <span className="font-medium">Receipt:</span>
                        <span className="text-muted-foreground">Assay: {(pour.weight * 0.93).toFixed(2)}g pure</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-green-500"></div>
                        <span className="font-medium">Payment:</span>
                        <span className="text-muted-foreground">$2,150.00 • Bank Transfer • Confirmed</span>
                      </div>
                    </>
                  )}
                </div>

                {pour.status === 'in-storage' && (
                  <div className="mt-3 pt-3 border-t">
                    <p className="text-xs text-orange-600">⚠ Awaiting dispatch</p>
                  </div>
                )}
                {pour.status === 'dispatched' && (
                  <div className="mt-3 pt-3 border-t">
                    <p className="text-xs text-blue-600">⏳ In transit - awaiting receipt confirmation</p>
                  </div>
                )}
                {pour.status === 'received' && (
                  <div className="mt-3 pt-3 border-t">
                    <p className="text-xs text-green-600">✓ Transaction complete</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-3">
        <Button variant="outline" className="flex-1">
          Export Reconciliation Report (PDF)
        </Button>
        <Button variant="outline" className="flex-1">
          Export to CSV
        </Button>
      </div>
    </div>
  )
}

function AuditTrail({ setViewMode }: { setViewMode: (mode: ViewMode) => void }) {
  return (
    <div className="space-y-6">
      <Button variant="outline" onClick={() => setViewMode('menu')}>
        ← Back to Menu
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>Audit Trail</CardTitle>
          <CardDescription>Immutable log of all gold operations</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {mockAuditLog.map((log, index) => (
              <div key={index} className="flex gap-4 p-3 border-l-4 border-border bg-muted/60 rounded">
                <div className="flex-shrink-0 text-xs text-muted-foreground w-32">
                  {log.timestamp}
                </div>
                <div className="flex-1">
                  <div className="font-medium text-sm">{log.action}</div>
                  <div className="text-sm text-muted-foreground">{log.details}</div>
                  <div className="text-xs text-muted-foreground mt-1">By: {log.user}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 pt-4 border-t">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Shield className="h-4 w-4" />
              <span>All entries are cryptographically secured and cannot be modified</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Button variant="outline" className="w-full">
        Export Complete Audit Log (PDF)
      </Button>
    </div>
  )
}
