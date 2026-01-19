"use client"

import { useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select } from "@/components/ui/select"
import { ArrowLeft, Save, Send, AlertCircle } from "lucide-react"

export default function PlantReportPage() {
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    site: '',
    tonnesFed: '',
    tonnesProcessed: '',
    runHours: '',
    dieselUsed: '',
    grindingMedia: '',
    reagentsUsed: '',
    waterUsed: '',
    goldRecovered: '',
    notes: '',
  })

  const [downtimeEvents, setDowntimeEvents] = useState<Array<{code: string, hours: string, notes: string}>>([])
  const [saving, setSaving] = useState(false)

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const addDowntime = () => {
    setDowntimeEvents([...downtimeEvents, { code: '', hours: '', notes: '' }])
  }

  const updateDowntime = (index: number, field: string, value: string) => {
    const updated = [...downtimeEvents]
    updated[index] = { ...updated[index], [field]: value }
    setDowntimeEvents(updated)
  }

  const removeDowntime = (index: number) => {
    setDowntimeEvents(downtimeEvents.filter((_, i) => i !== index))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    
    console.log('Submitting plant report:', { ...formData, downtimeEvents })
    
    setTimeout(() => {
      setSaving(false)
      alert('Plant report submitted successfully!')
    }, 1000)
  }

  const totalDowntime = downtimeEvents.reduce((sum, event) => 
    sum + (parseFloat(event.hours) || 0), 0
  )

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-purple-600 text-white shadow-lg">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Link href="/">
              <Button variant="ghost" className="text-white hover:bg-purple-700 p-2">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-xl md:text-2xl font-bold">Plant Report</h1>
              <p className="text-purple-100 text-sm">Processing and consumables tracking</p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Form */}
      <main className="container mx-auto px-4 py-6 max-w-2xl">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Info */}
          <Card>
            <CardHeader>
              <CardTitle>Plant Details</CardTitle>
              <CardDescription>Date and site information</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Date *</label>
                  <Input
                    type="date"
                    name="date"
                    value={formData.date}
                    onChange={handleChange}
                    required
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-2">Site *</label>
                  <Select name="site" value={formData.site} onChange={handleChange} required>
                    <option value="">Select site...</option>
                    <option value="site1">Mine Site 1</option>
                    <option value="site2">Mine Site 2</option>
                    <option value="site3">Mine Site 3</option>
                    <option value="site4">Mine Site 4</option>
                    <option value="site5">Mine Site 5</option>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Production */}
          <Card>
            <CardHeader>
              <CardTitle>Production</CardTitle>
              <CardDescription>Tonnes processed and run hours</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Tonnes Fed</label>
                  <Input
                    type="number"
                    name="tonnesFed"
                    value={formData.tonnesFed}
                    onChange={handleChange}
                    placeholder="0.00"
                    step="0.01"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-2">Tonnes Processed</label>
                  <Input
                    type="number"
                    name="tonnesProcessed"
                    value={formData.tonnesProcessed}
                    onChange={handleChange}
                    placeholder="0.00"
                    step="0.01"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-2">Run Hours</label>
                  <Input
                    type="number"
                    name="runHours"
                    value={formData.runHours}
                    onChange={handleChange}
                    placeholder="0.0"
                    step="0.1"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Consumables */}
          <Card>
            <CardHeader>
              <CardTitle>Consumables</CardTitle>
              <CardDescription>Fuel, grinding media, reagents, water</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Diesel Used (litres)</label>
                  <Input
                    type="number"
                    name="dieselUsed"
                    value={formData.dieselUsed}
                    onChange={handleChange}
                    placeholder="0.0"
                    step="0.1"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-2">Grinding Media (kg)</label>
                  <Input
                    type="number"
                    name="grindingMedia"
                    value={formData.grindingMedia}
                    onChange={handleChange}
                    placeholder="0.0"
                    step="0.1"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-2">Reagents/Chemicals (kg)</label>
                  <Input
                    type="number"
                    name="reagentsUsed"
                    value={formData.reagentsUsed}
                    onChange={handleChange}
                    placeholder="0.0"
                    step="0.1"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-2">Water Used (m³)</label>
                  <Input
                    type="number"
                    name="waterUsed"
                    value={formData.waterUsed}
                    onChange={handleChange}
                    placeholder="0.0"
                    step="0.1"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Downtime */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Downtime Events</span>
                {totalDowntime > 0 && (
                  <span className="text-sm font-normal text-orange-600">
                    Total: {totalDowntime.toFixed(1)} hours
                  </span>
                )}
              </CardTitle>
              <CardDescription>Track all stoppages and reasons</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {downtimeEvents.length === 0 ? (
                <div className="text-center py-6 text-gray-500">
                  <AlertCircle className="h-8 w-8 mx-auto mb-2" />
                  <p className="text-sm">No downtime events recorded</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {downtimeEvents.map((event, index) => (
                    <div key={index} className="border rounded-lg p-3 space-y-3">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <Select
                          value={event.code}
                          onChange={(e) => updateDowntime(index, 'code', e.target.value)}
                          required
                        >
                          <option value="">Select reason...</option>
                          <option value="NO_POWER">No power</option>
                          <option value="NO_WATER">No water</option>
                          <option value="BREAKDOWN">Equipment breakdown</option>
                          <option value="NO_FUEL">No fuel/diesel</option>
                          <option value="NO_SPARES">No spares/parts</option>
                          <option value="NO_GRINDING_MEDIA">No grinding media</option>
                          <option value="NO_REAGENTS">No reagents/chemicals</option>
                          <option value="LABOUR_SHORTAGE">Labour shortage</option>
                          <option value="WEATHER">Weather/flooding</option>
                          <option value="OTHER">Other</option>
                        </Select>
                        
                        <Input
                          type="number"
                          placeholder="Hours"
                          value={event.hours}
                          onChange={(e) => updateDowntime(index, 'hours', e.target.value)}
                          step="0.1"
                          required
                        />
                      </div>
                      
                      <Input
                        type="text"
                        placeholder="Additional notes..."
                        value={event.notes}
                        onChange={(e) => updateDowntime(index, 'notes', e.target.value)}
                      />
                      
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        onClick={() => removeDowntime(index)}
                      >
                        Remove
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              
              <Button
                type="button"
                variant="outline"
                onClick={addDowntime}
                className="w-full"
              >
                + Add Downtime Event
              </Button>
            </CardContent>
          </Card>

          {/* Gold Recovered */}
          <Card>
            <CardHeader>
              <CardTitle>Gold Recovered</CardTitle>
              <CardDescription>Only if a pour happened today</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Gold Recovered (grams)</label>
                  <Input
                    type="number"
                    name="goldRecovered"
                    value={formData.goldRecovered}
                    onChange={handleChange}
                    placeholder="0.00"
                    step="0.01"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Notes */}
          <Card>
            <CardHeader>
              <CardTitle>Additional Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                name="notes"
                value={formData.notes}
                onChange={handleChange}
                placeholder="Any additional observations or issues..."
                rows={3}
              />
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => alert('Draft saved!')}
              className="flex-1"
            >
              <Save className="mr-2 h-5 w-5" />
              Save Draft
            </Button>
            
            <Button
              type="submit"
              disabled={saving}
              className="flex-1"
            >
              <Send className="mr-2 h-5 w-5" />
              Submit Report
            </Button>
          </div>
        </form>
      </main>
    </div>
  )
}
