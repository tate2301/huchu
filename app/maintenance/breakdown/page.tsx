"use client"

import { useEffect, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import { AlertTriangle } from "lucide-react"

import { PageHeading } from "@/components/layout/page-heading"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/components/ui/use-toast"
import { fetchEquipment, fetchSites, fetchUsers } from "@/lib/api"
import { fetchJson, getApiErrorMessage } from "@/lib/api-client"
import { MaintenanceNav } from "../maintenance-nav"

export default function BreakdownPage() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [selectedSiteId, setSelectedSiteId] = useState("")
  const [breakdownForm, setBreakdownForm] = useState({
    siteId: "",
    equipmentId: "",
    issue: "",
    downtimeStart: "",
    technicianId: "",
  })

  const { data: sites, isLoading: sitesLoading, error: sitesError } = useQuery({
    queryKey: ["sites"],
    queryFn: fetchSites,
  })

  useEffect(() => {
    if (!selectedSiteId && sites && sites.length > 0) {
      setSelectedSiteId(sites[0].id)
      setBreakdownForm((prev) => ({ ...prev, siteId: sites[0].id }))
    }
  }, [selectedSiteId, sites])

  const {
    data: equipmentData,
    isLoading: equipmentLoading,
    error: equipmentError,
  } = useQuery({
    queryKey: ["equipment", selectedSiteId],
    queryFn: () => fetchEquipment({ siteId: selectedSiteId, limit: 200 }),
    enabled: !!selectedSiteId,
  })

  const {
    data: usersData,
    isLoading: usersLoading,
    error: usersError,
  } = useQuery({
    queryKey: ["users", "technicians"],
    queryFn: () => fetchUsers({ active: true, limit: 200 }),
  })

  const equipment = equipmentData?.data ?? []
  const technicians = usersData?.data ?? []

  const createWorkOrderMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) =>
      fetchJson("/api/work-orders", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      toast({
        title: "Work order created",
        description: "Breakdown logged and added to the work order list.",
        variant: "success",
      })
      setBreakdownForm((prev) => ({
        ...prev,
        equipmentId: "",
        issue: "",
        downtimeStart: "",
        technicianId: "",
      }))
      queryClient.invalidateQueries({ queryKey: ["work-orders"] })
      router.push("/maintenance/work-orders")
    },
  })

  const handleBreakdownSubmit = (event: React.FormEvent) => {
    event.preventDefault()

    if (
      !breakdownForm.equipmentId ||
      !breakdownForm.issue ||
      !breakdownForm.downtimeStart
    ) {
      toast({
        title: "Missing details",
        description: "Equipment, issue, and downtime start are required.",
        variant: "destructive",
      })
      return
    }

    createWorkOrderMutation.mutate({
      equipmentId: breakdownForm.equipmentId,
      issue: breakdownForm.issue,
      downtimeStart: breakdownForm.downtimeStart,
      technicianId: breakdownForm.technicianId || undefined,
      status: "OPEN",
    })
  }

  const error = sitesError || equipmentError || usersError || createWorkOrderMutation.error

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <PageHeading
        title="Log Breakdown"
        description="Report equipment breakdown and create work order"
      />

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Unable to load data</AlertTitle>
          <AlertDescription>{getApiErrorMessage(error)}</AlertDescription>
        </Alert>
      )}

      <MaintenanceNav />

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <CardTitle>Log Equipment Breakdown</CardTitle>
          </div>
          <CardDescription>
            Create a work order for equipment that has broken down
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleBreakdownSubmit} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="site" className="text-sm font-medium">Site</label>
              {sitesLoading ? (
                <Skeleton className="h-9 w-full" />
              ) : (
                <Select
                  value={selectedSiteId}
                  onValueChange={(value) => {
                    setSelectedSiteId(value)
                    setBreakdownForm((prev) => ({ ...prev, siteId: value, equipmentId: "" }))
                  }}
                >
                  <SelectTrigger id="site">
                    <SelectValue placeholder="Select site" />
                  </SelectTrigger>
                  <SelectContent>
                    {sites?.map((site) => (
                      <SelectItem key={site.id} value={site.id}>
                        {site.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="space-y-2">
              <label htmlFor="equipment" className="text-sm font-medium">Equipment</label>
              {equipmentLoading ? (
                <Skeleton className="h-9 w-full" />
              ) : (
                <Select
                  value={breakdownForm.equipmentId}
                  onValueChange={(value) =>
                    setBreakdownForm((prev) => ({ ...prev, equipmentId: value }))
                  }
                >
                  <SelectTrigger id="equipment">
                    <SelectValue placeholder="Select equipment" />
                  </SelectTrigger>
                  <SelectContent>
                    {equipment.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.name} ({item.equipmentCode})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="space-y-2">
              <label htmlFor="issue" className="text-sm font-medium">Issue Description</label>
              <Textarea
                id="issue"
                placeholder="Describe the breakdown..."
                value={breakdownForm.issue}
                onChange={(e) =>
                  setBreakdownForm((prev) => ({ ...prev, issue: e.target.value }))
                }
                rows={4}
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="downtimeStart" className="text-sm font-medium">Downtime Start</label>
              <Input
                id="downtimeStart"
                type="datetime-local"
                value={breakdownForm.downtimeStart}
                onChange={(e) =>
                  setBreakdownForm((prev) => ({ ...prev, downtimeStart: e.target.value }))
                }
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="technician" className="text-sm font-medium">Assign Technician (Optional)</label>
              {usersLoading ? (
                <Skeleton className="h-9 w-full" />
              ) : (
                <Select
                  value={breakdownForm.technicianId}
                  onValueChange={(value) =>
                    setBreakdownForm((prev) => ({ ...prev, technicianId: value }))
                  }
                >
                  <SelectTrigger id="technician">
                    <SelectValue placeholder="Select technician" />
                  </SelectTrigger>
                  <SelectContent>
                    {technicians.map((user) => (
                      <SelectItem key={user.id} value={user.id}>
                        {user.name} ({user.email})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="flex gap-2 pt-4">
              <Button type="submit" disabled={createWorkOrderMutation.isPending}>
                {createWorkOrderMutation.isPending ? "Creating..." : "Create Work Order"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => router.push("/maintenance")}
              >
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
