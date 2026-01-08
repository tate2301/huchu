"use client"

import { useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select } from "@/components/ui/select"
import { ArrowLeft, Coins, Send, Shield, Package, FileCheck } from "lucide-react"

type ViewMode = 'menu' | 'pour' | 'dispatch' | 'receipt'

export default function GoldPage() {
  const [viewMode, setViewMode] = useState<ViewMode>('menu')

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-yellow-600 text-white shadow-lg">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Link href="/">
              <Button variant="ghost" className="text-white hover:bg-yellow-700 p-2">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-xl md:text-2xl font-bold">Gold Control</h1>
              <p className="text-yellow-100 text-sm">
                {viewMode === 'menu' ? 'Security-critical operations' : 
                 viewMode === 'pour' ? 'Record Pour' :
                 viewMode === 'dispatch' ? 'Dispatch Manifest' : 'Buyer Receipt'}
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-2xl">
        {viewMode === 'menu' && <GoldMenu setViewMode={setViewMode} />}
        {viewMode === 'pour' && <PourForm setViewMode={setViewMode} />}
        {viewMode === 'dispatch' && <DispatchForm setViewMode={setViewMode} />}
        {viewMode === 'receipt' && <ReceiptForm setViewMode={setViewMode} />}
      </main>
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
              <p className="text-gray-700">
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

        <Card className="cursor-pointer hover:shadow-lg transition-shadow">
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
          <CardTitle>Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center text-gray-500 py-6">
            <p className="text-sm">No gold operations recorded yet</p>
          </div>
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
              value={formData.site}
              onChange={(e) => setFormData({...formData, site: e.target.value})}
              required
            >
              <option value="">Select site...</option>
              <option value="site1">Mine Site 1</option>
              <option value="site2">Mine Site 2</option>
              <option value="site3">Mine Site 3</option>
              <option value="site4">Mine Site 4</option>
              <option value="site5">Mine Site 5</option>
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
  return (
    <div className="space-y-6">
      <Button variant="outline" onClick={() => setViewMode('menu')}>
        ← Back to Menu
      </Button>
      <Card>
        <CardHeader>
          <CardTitle>Dispatch Manifest</CardTitle>
          <CardDescription>Under construction - Phase 3</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-600">
            This form will capture: courier, vehicle, destination, seal numbers, handover details.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

function ReceiptForm({ setViewMode }: { setViewMode: (mode: ViewMode) => void }) {
  return (
    <div className="space-y-6">
      <Button variant="outline" onClick={() => setViewMode('menu')}>
        ← Back to Menu
      </Button>
      <Card>
        <CardHeader>
          <CardTitle>Buyer Receipt</CardTitle>
          <CardDescription>Under construction - Phase 3</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-600">
            This form will capture: receipt number, assay result, paid amount, payment method.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
