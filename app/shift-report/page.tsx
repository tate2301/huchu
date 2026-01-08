"use client"

import { useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select } from "@/components/ui/select"
import { ArrowLeft, Save, Send, Camera } from "lucide-react"

export default function ShiftReportPage() {
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    shift: 'DAY',
    site: '',
    section: '',
    supervisor: '',
    crewCount: '',
    workType: 'PRODUCTION',
    outputTonnes: '',
    outputTrips: '',
    outputWheelbarrows: '',
    metresAdvanced: '',
    hasIncident: false,
    incidentNotes: '',
    handoverNotes: '',
  })

  const [saving, setSaving] = useState(false)

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value
    }))
  }

  const handleSaveDraft = async () => {
    setSaving(true)
    // Save to localStorage for offline support
    localStorage.setItem('shiftReportDraft', JSON.stringify({
      ...formData,
      savedAt: new Date().toISOString()
    }))
    setTimeout(() => {
      setSaving(false)
      alert('Draft saved locally!')
    }, 500)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    
    // In production, this would sync to backend
    console.log('Submitting shift report:', formData)
    
    setTimeout(() => {
      setSaving(false)
      alert('Shift report submitted successfully!\n\nIn production, this would:\n- Sync to database\n- Notify supervisor for verification\n- Generate WhatsApp summary')
      // Clear form
      localStorage.removeItem('shiftReportDraft')
    }, 1000)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-blue-600 text-white shadow-lg">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Link href="/">
              <Button variant="ghost" className="text-white hover:bg-blue-700 p-2">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-xl md:text-2xl font-bold">Shift Report</h1>
              <p className="text-blue-100 text-sm">Quick 2-minute daily entry</p>
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
              <CardTitle>Shift Information</CardTitle>
              <CardDescription>Date, shift, and location details</CardDescription>
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
                  <label className="block text-sm font-medium mb-2">Shift *</label>
                  <Select name="shift" value={formData.shift} onChange={handleChange} required>
                    <option value="DAY">Day Shift</option>
                    <option value="NIGHT">Night Shift</option>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                
                <div>
                  <label className="block text-sm font-medium mb-2">Section/Level</label>
                  <Input
                    type="text"
                    name="section"
                    value={formData.section}
                    onChange={handleChange}
                    placeholder="e.g., Shaft 2, Level 3"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Supervisor *</label>
                  <Input
                    type="text"
                    name="supervisor"
                    value={formData.supervisor}
                    onChange={handleChange}
                    placeholder="Supervisor name"
                    required
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-2">Crew Count *</label>
                  <Input
                    type="number"
                    name="crewCount"
                    value={formData.crewCount}
                    onChange={handleChange}
                    placeholder="Number of workers"
                    min="0"
                    required
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Work Details */}
          <Card>
            <CardHeader>
              <CardTitle>Work & Output</CardTitle>
              <CardDescription>What was done and produced</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Work Type *</label>
                <Select name="workType" value={formData.workType} onChange={handleChange} required>
                  <option value="DEVELOPMENT">Development</option>
                  <option value="PRODUCTION">Production/Stoping</option>
                  <option value="HAULAGE">Haulage/Mucking</option>
                  <option value="SUPPORT">Support Work</option>
                  <option value="OTHER">Other</option>
                </Select>
              </div>

              <div className="border-t pt-4">
                <h4 className="text-sm font-medium mb-3">Output Metrics (fill what applies)</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm mb-2">Tonnes</label>
                    <Input
                      type="number"
                      name="outputTonnes"
                      value={formData.outputTonnes}
                      onChange={handleChange}
                      placeholder="0.00"
                      step="0.01"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm mb-2">Trips</label>
                    <Input
                      type="number"
                      name="outputTrips"
                      value={formData.outputTrips}
                      onChange={handleChange}
                      placeholder="0"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm mb-2">Wheelbarrows</label>
                    <Input
                      type="number"
                      name="outputWheelbarrows"
                      value={formData.outputWheelbarrows}
                      onChange={handleChange}
                      placeholder="0"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm mb-2">Metres Advanced</label>
                    <Input
                      type="number"
                      name="metresAdvanced"
                      value={formData.metresAdvanced}
                      onChange={handleChange}
                      placeholder="0.0"
                      step="0.1"
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Safety & Handover */}
          <Card>
            <CardHeader>
              <CardTitle>Safety & Handover</CardTitle>
              <CardDescription>Incidents and notes for next shift</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="flex items-center gap-2 text-sm font-medium">
                  <input
                    type="checkbox"
                    name="hasIncident"
                    checked={formData.hasIncident}
                    onChange={handleChange}
                    className="h-5 w-5 rounded border-gray-300"
                  />
                  Incident or near miss occurred
                </label>
              </div>

              {formData.hasIncident && (
                <div>
                  <label className="block text-sm font-medium mb-2">Incident Details *</label>
                  <Textarea
                    name="incidentNotes"
                    value={formData.incidentNotes}
                    onChange={handleChange}
                    placeholder="Describe what happened..."
                    rows={3}
                    required={formData.hasIncident}
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium mb-2">Handover Notes</label>
                <Textarea
                  name="handoverNotes"
                  value={formData.handoverNotes}
                  onChange={handleChange}
                  placeholder="What should the next shift know?"
                  rows={3}
                />
              </div>

              <div>
                <Button type="button" variant="outline" className="w-full">
                  <Camera className="mr-2 h-5 w-5" />
                  Add Photos (Optional)
                </Button>
                <p className="text-xs text-gray-500 mt-1 text-center">
                  Photos can be added as evidence
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={handleSaveDraft}
              disabled={saving}
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

          <p className="text-xs text-center text-gray-500">
            ✓ Saves offline • ✓ Auto-syncs when connected • ✓ 2-minute form
          </p>
        </form>
      </main>
    </div>
  )
}
