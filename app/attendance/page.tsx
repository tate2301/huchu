"use client"

import { useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { ArrowLeft, Save, Send, UserCheck, UserX } from "lucide-react"

interface CrewMember {
  id: string
  name: string
  status: 'PRESENT' | 'ABSENT' | 'LATE'
  overtime: string
}

export default function AttendancePage() {
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    shift: 'DAY',
    site: '',
  })

  const [crew, setCrew] = useState<CrewMember[]>([
    { id: '1', name: 'John Moyo', status: 'PRESENT', overtime: '' },
    { id: '2', name: 'Sarah Ncube', status: 'PRESENT', overtime: '' },
    { id: '3', name: 'David Sibanda', status: 'PRESENT', overtime: '' },
    { id: '4', name: 'Grace Mutasa', status: 'PRESENT', overtime: '' },
    { id: '5', name: 'Peter Chikwanha', status: 'PRESENT', overtime: '' },
  ])

  const [saving, setSaving] = useState(false)

  const updateCrewStatus = (id: string, status: CrewMember['status']) => {
    setCrew(prev => prev.map(member => 
      member.id === id ? { ...member, status } : member
    ))
  }

  const updateOvertime = (id: string, overtime: string) => {
    setCrew(prev => prev.map(member => 
      member.id === id ? { ...member, overtime } : member
    ))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    
    console.log('Submitting attendance:', { ...formData, crew })
    
    setTimeout(() => {
      setSaving(false)
      alert('Attendance submitted successfully!')
    }, 1000)
  }

  const presentCount = crew.filter(m => m.status === 'PRESENT' || m.status === 'LATE').length
  const absentCount = crew.filter(m => m.status === 'ABSENT').length

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-green-600 text-white shadow-lg">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Link href="/">
              <Button variant="ghost" className="text-white hover:bg-green-700 p-2">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-xl md:text-2xl font-bold">Daily Attendance</h1>
              <p className="text-green-100 text-sm">Track crew presence and overtime</p>
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
              <CardTitle>Shift Details</CardTitle>
              <CardDescription>Date, shift, and site information</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Date *</label>
                  <Input
                    type="date"
                    value={formData.date}
                    onChange={(e) => setFormData({...formData, date: e.target.value})}
                    required
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-2">Shift *</label>
                  <Select 
                    value={formData.shift} 
                    onChange={(e) => setFormData({...formData, shift: e.target.value})}
                    required
                  >
                    <option value="DAY">Day Shift</option>
                    <option value="NIGHT">Night Shift</option>
                  </Select>
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
              </div>
            </CardContent>
          </Card>

          {/* Summary */}
          <div className="grid grid-cols-2 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <UserCheck className="h-8 w-8 text-green-600" />
                  <div>
                    <div className="text-2xl font-bold">{presentCount}</div>
                    <div className="text-sm text-gray-600">Present</div>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <UserX className="h-8 w-8 text-red-600" />
                  <div>
                    <div className="text-2xl font-bold">{absentCount}</div>
                    <div className="text-sm text-gray-600">Absent</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Crew List */}
          <Card>
            <CardHeader>
              <CardTitle>Crew Attendance</CardTitle>
              <CardDescription>Mark attendance for each crew member</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {crew.map((member) => (
                  <div 
                    key={member.id} 
                    className="flex flex-col md:flex-row md:items-center gap-3 p-3 border rounded-lg"
                  >
                    <div className="flex-1 font-medium">{member.name}</div>
                    
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant={member.status === 'PRESENT' ? 'default' : 'outline'}
                        onClick={() => updateCrewStatus(member.id, 'PRESENT')}
                      >
                        Present
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={member.status === 'LATE' ? 'secondary' : 'outline'}
                        onClick={() => updateCrewStatus(member.id, 'LATE')}
                      >
                        Late
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={member.status === 'ABSENT' ? 'destructive' : 'outline'}
                        onClick={() => updateCrewStatus(member.id, 'ABSENT')}
                      >
                        Absent
                      </Button>
                    </div>
                    
                    {(member.status === 'PRESENT' || member.status === 'LATE') && (
                      <div className="w-full md:w-32">
                        <Input
                          type="number"
                          placeholder="OT hrs"
                          value={member.overtime}
                          onChange={(e) => updateOvertime(member.id, e.target.value)}
                          step="0.5"
                          className="h-9"
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
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
              Submit Attendance
            </Button>
          </div>
        </form>
      </main>
    </div>
  )
}
