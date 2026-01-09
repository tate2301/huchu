"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { CheckCircle2, Circle, Clock } from "lucide-react"

interface PhaseItem {
  name: string
  status: 'complete' | 'in-progress' | 'pending'
  description: string
}

interface Phase {
  phase: number
  title: string
  status: 'complete' | 'in-progress' | 'pending'
  items: PhaseItem[]
}

const phases: Phase[] = [
  {
    phase: 1,
    title: "Daily Heartbeat",
    status: "complete",
    items: [
      { name: "Shift Report Form", status: "complete", description: "2-minute mobile-first entry" },
      { name: "Attendance Tracking", status: "complete", description: "Daily crew presence" },
      { name: "Plant Report Basic", status: "complete", description: "Production metrics" },
      { name: "Gold Control Setup", status: "complete", description: "Pour recording" },
      { name: "Dashboard", status: "complete", description: "Module navigation" },
    ]
  },
  {
    phase: 2,
    title: "Processing + Downtime",
    status: "complete",
    items: [
      { name: "Enhanced Plant Report", status: "complete", description: "Full downtime tracking" },
      { name: "Downtime Analytics", status: "complete", description: "Top causes by site" },
      { name: "Trend Charts", status: "pending", description: "Tonnes processed, downtime hours" },
      { name: "Weekly Reports", status: "pending", description: "Summary views" },
    ]
  },
  {
    phase: 3,
    title: "Gold Control",
    status: "complete",
    items: [
      { name: "Dispatch Manifest", status: "complete", description: "Chain of custody" },
      { name: "Buyer Receipt", status: "complete", description: "Assay and payment" },
      { name: "Reconciliation View", status: "complete", description: "Pour → dispatch → receipt" },
      { name: "Audit Trail", status: "complete", description: "Immutable records" },
    ]
  },
  {
    phase: 4,
    title: "Stores + Maintenance",
    status: "complete",
    items: [
      { name: "Inventory Management", status: "complete", description: "Stock on hand with reorder alerts" },
      { name: "Fuel Ledger", status: "complete", description: "Diesel tracking with balance" },
      { name: "Equipment Register", status: "complete", description: "QR codes and service tracking" },
      { name: "Work Orders", status: "complete", description: "Breakdown logging and PM schedule" },
    ]
  },
  {
    phase: 5,
    title: "Compliance",
    status: "pending",
    items: [
      { name: "Permit Calendar", status: "pending", description: "Expiry alerts" },
      { name: "Incident Reports", status: "pending", description: "With photos" },
      { name: "Training Matrix", status: "pending", description: "Certifications" },
      { name: "Audit Exports", status: "pending", description: "PDF/CSV packs" },
    ]
  },
  {
    phase: 6,
    title: "Analytics",
    status: "pending",
    items: [
      { name: "Cross-Mine Dashboard", status: "pending", description: "All sites view" },
      { name: "Production Trends", status: "pending", description: "Historical data" },
      { name: "Cost Analysis", status: "pending", description: "Per gram costs" },
      { name: "Safety Metrics", status: "pending", description: "Incidents tracking" },
    ]
  }
]

function StatusIcon({ status }: { status: PhaseItem['status'] }) {
  switch (status) {
    case 'complete':
      return <CheckCircle2 className="h-5 w-5 text-green-600" />
    case 'in-progress':
      return <Clock className="h-5 w-5 text-orange-600" />
    case 'pending':
      return <Circle className="h-5 w-5 text-gray-300" />
  }
}

function PhaseStatusBadge({ status }: { status: Phase['status'] }) {
  const styles = {
    complete: "bg-green-100 text-green-800",
    'in-progress': "bg-orange-100 text-orange-800",
    pending: "bg-gray-100 text-gray-600"
  }
  
  const labels = {
    complete: "Complete",
    'in-progress': "In Progress",
    pending: "Pending"
  }
  
  return (
    <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles[status]}`}>
      {labels[status]}
    </span>
  )
}

export function SystemStatus() {
  const currentPhase = phases.find(p => p.status === 'in-progress') || phases[0]
  
  return (
    <Card className="mb-8">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Implementation Status</CardTitle>
            <CardDescription>
              Current Phase: {currentPhase.phase} - {currentPhase.title}
            </CardDescription>
          </div>
          <PhaseStatusBadge status={currentPhase.status} />
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {phases.map((phase) => (
            <div key={phase.phase} className="border-l-4 border-gray-200 pl-4">
              <div className="flex items-center gap-3 mb-3">
                <span className="font-semibold text-lg">
                  Phase {phase.phase}
                </span>
                <span className="text-gray-600">{phase.title}</span>
                <PhaseStatusBadge status={phase.status} />
              </div>
              
              <div className="space-y-2">
                {phase.items.map((item, idx) => (
                  <div key={idx} className="flex items-start gap-3">
                    <StatusIcon status={item.status} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className={`text-sm font-medium ${
                          item.status === 'complete' ? 'text-gray-900' : 'text-gray-600'
                        }`}>
                          {item.name}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500">{item.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
