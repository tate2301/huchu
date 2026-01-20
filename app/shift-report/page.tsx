"use client"

import { useState } from "react"
import { PageActions } from "@/components/layout/page-actions"
import { PageHeading } from "@/components/layout/page-heading"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Save, Send, Camera } from "lucide-react"

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

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value
    }))
  }

  const handleSelectChange = (field: keyof typeof formData) => (value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value,
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
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <PageActions>
        <Button size="sm" variant="outline" onClick={handleSaveDraft} disabled={saving}>
          <Save className="h-4 w-4" />
          Save Draft
        </Button>
        <Button size="sm" type="submit" form="shift-report-form" disabled={saving}>
          <Send className="h-4 w-4" />
          Submit
        </Button>
      </PageActions>

      <PageHeading title="Shift Report" description="Quick 2-minute daily entry" />

      <form id="shift-report-form" onSubmit={handleSubmit} className="space-y-6">
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
                  <Select
                    name="shift"
                    value={formData.shift}
                    onValueChange={handleSelectChange("shift")}
                    required
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select shift" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="DAY">Day Shift</SelectItem>
                      <SelectItem value="NIGHT">Night Shift</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                <Select
                  name="workType"
                  value={formData.workType}
                  onValueChange={handleSelectChange("workType")}
                  required
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select work type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DEVELOPMENT">Development</SelectItem>
                    <SelectItem value="PRODUCTION">Production/Stoping</SelectItem>
                    <SelectItem value="HAULAGE">Haulage/Mucking</SelectItem>
                    <SelectItem value="SUPPORT">Support Work</SelectItem>
                    <SelectItem value="OTHER">Other</SelectItem>
                  </SelectContent>
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
                    className="h-5 w-5 rounded border-border"
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
                <p className="text-xs text-muted-foreground mt-1 text-center">
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

          <p className="text-xs text-center text-muted-foreground">
            Saves offline / Auto-syncs when connected / 2-minute form
          </p>
        </form>
    </div>
  )
}
