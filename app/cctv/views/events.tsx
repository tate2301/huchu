"use client"

import { useRef, useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { AlertCircle, CheckCircle, Clock, Download } from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { PdfTemplate } from "@/components/pdf/pdf-template"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { useToast } from "@/components/ui/use-toast"
import { fetchCCTVEvents, Site } from "@/lib/api"
import { fetchJson, getApiErrorMessage } from "@/lib/api-client"
import { exportElementToPdf } from "@/lib/pdf"

interface EventsViewProps {
  sites: Site[]
  selectedSiteId: string
  onSiteChange: (siteId: string) => void
}

export function EventsView({ sites, selectedSiteId, onSiteChange }: EventsViewProps) {
  const eventsPdfRef = useRef<HTMLDivElement | null>(null)
  const [severityFilter, setSeverityFilter] = useState<string>("")
  const [statusFilter, setStatusFilter] = useState<string>("unacknowledged")
  const [acknowledgingEvent, setAcknowledgingEvent] = useState<string | null>(null)
  const [acknowledgeNotes, setAcknowledgeNotes] = useState("")

  const queryClient = useQueryClient()
  const { toast } = useToast()

  const { data, isLoading, error } = useQuery({
    queryKey: ["cctv-events", selectedSiteId, severityFilter, statusFilter],
    queryFn: () =>
      fetchCCTVEvents({
        severity: severityFilter || undefined,
        isAcknowledged: statusFilter === "acknowledged" ? true : statusFilter === "unacknowledged" ? false : undefined,
        limit: 50,
      }),
  })

  const acknowledgeMutation = useMutation({
    mutationFn: async ({ eventId, notes }: { eventId: string; notes: string }) => {
      return fetchJson("/api/cctv/events", {
        method: "PATCH",
        body: JSON.stringify({ eventId, notes }),
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cctv-events"] })
      setAcknowledgingEvent(null)
      setAcknowledgeNotes("")
      toast({
        title: "Event Acknowledged",
        description: "The event has been marked as acknowledged.",
      })
    },
    onError: (error: unknown) => {
      toast({
        title: "Error",
        description: getApiErrorMessage(error),
        variant: "destructive",
      })
    },
  })

  const events = data?.data || []
  const activeSiteName =
    sites.find((site) => site.id === selectedSiteId)?.name || "All Sites"
  const acknowledgedCount = events.filter((event) => event.isAcknowledged).length
  const unacknowledgedCount = events.filter((event) => !event.isAcknowledged).length
  const exportDisabled = isLoading || events.length === 0

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "CRITICAL":
        return "text-red-600 bg-red-50"
      case "HIGH":
        return "text-orange-600 bg-orange-50"
      case "MEDIUM":
        return "text-yellow-600 bg-yellow-50"
      case "LOW":
        return "text-blue-600 bg-blue-50"
      default:
        return "text-gray-600 bg-gray-50"
    }
  }

  const getSeverityBadgeVariant = (severity: string) => {
    switch (severity) {
      case "CRITICAL":
        return "destructive"
      case "HIGH":
        return "outline"
      default:
        return "secondary"
    }
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-8">
          <p className="text-center text-red-600">Error loading events: {error.message}</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-4">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium">Severity:</label>
              <Select
                value={severityFilter}
                onValueChange={(value) =>
                  setSeverityFilter(value === "__all_severities__" ? "" : value)
                }
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="All Severities" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all_severities__">All Severities</SelectItem>
                  <SelectItem value="CRITICAL">Critical</SelectItem>
                  <SelectItem value="HIGH">High</SelectItem>
                  <SelectItem value="MEDIUM">Medium</SelectItem>
                  <SelectItem value="LOW">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-sm font-medium">Status:</label>
              <Select
                value={statusFilter}
                onValueChange={(value) =>
                  setStatusFilter(value === "__all_status__" ? "" : value)
                }
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="All Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all_status__">All Status</SelectItem>
                  <SelectItem value="unacknowledged">Unacknowledged</SelectItem>
                  <SelectItem value="acknowledged">Acknowledged</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {(severityFilter || statusFilter !== "unacknowledged") && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSeverityFilter("")
                  setStatusFilter("unacknowledged")
                }}
              >
                Clear Filters
              </Button>
            )}

            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (eventsPdfRef.current) {
                  exportElementToPdf(
                    eventsPdfRef.current,
                    `cctv-events-${new Date().toISOString().slice(0, 10)}.pdf`,
                  )
                }
              }}
              disabled={exportDisabled}
            >
              <Download className="mr-2 h-4 w-4" />
              Export PDF
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Events List */}
      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2 mt-2" />
              </CardHeader>
            </Card>
          ))}
        </div>
      ) : events.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <CheckCircle className="h-12 w-12 mx-auto text-green-600 mb-4" />
            <p className="text-sm text-muted-foreground">
              No events found. All clear!
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {events.map((event) => (
            <Card key={event.id} className={getSeverityColor(event.severity)}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <AlertCircle className="h-5 w-5" />
                      <CardTitle className="text-lg">{event.title}</CardTitle>
                    </div>
                    <CardDescription className="text-current opacity-80">
                      {event.camera ? (
                        <>
                          {event.camera.area} • {event.camera.name} • {event.camera.site?.name}
                        </>
                      ) : (
                        "System Event"
                      )}
                    </CardDescription>
                  </div>
                  <Badge variant={getSeverityBadgeVariant(event.severity)}>
                    {event.severity}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {event.description && (
                    <p className="text-sm">{event.description}</p>
                  )}

                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {new Date(event.eventTime).toLocaleString()}
                    </div>
                    <div className="flex items-center gap-1">
                      {event.isAcknowledged ? (
                        <>
                          <CheckCircle className="h-3 w-3 text-green-600" />
                          <span>Acknowledged</span>
                        </>
                      ) : (
                        <>
                          <AlertCircle className="h-3 w-3 text-orange-600" />
                          <span>Unacknowledged</span>
                        </>
                      )}
                    </div>
                  </div>

                  {!event.isAcknowledged && (
                    <div className="pt-3 border-t">
                      {acknowledgingEvent === event.id ? (
                        <div className="space-y-3">
                          <Textarea
                            placeholder="Add notes (optional)..."
                            value={acknowledgeNotes}
                            onChange={(e) => setAcknowledgeNotes(e.target.value)}
                            rows={2}
                          />
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              onClick={() =>
                                acknowledgeMutation.mutate({
                                  eventId: event.id,
                                  notes: acknowledgeNotes,
                                })
                              }
                              disabled={acknowledgeMutation.isPending}
                            >
                              {acknowledgeMutation.isPending ? "Acknowledging..." : "Confirm"}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setAcknowledgingEvent(null)
                                setAcknowledgeNotes("")
                              }}
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <Button
                          size="sm"
                          onClick={() => setAcknowledgingEvent(event.id)}
                        >
                          Acknowledge Event
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="absolute left-[-9999px] top-0">
        <div ref={eventsPdfRef}>
          <PdfTemplate
            title="CCTV Events"
            subtitle={`${activeSiteName} · ${severityFilter || "All severities"} · ${statusFilter || "All statuses"}`}
            meta={[
              { label: "Total events", value: String(events.length) },
              { label: "Acknowledged", value: String(acknowledgedCount) },
              { label: "Unacknowledged", value: String(unacknowledgedCount) },
            ]}
          >
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-200 text-left">
                  <th className="py-2">Event</th>
                  <th className="py-2">Severity</th>
                  <th className="py-2">Camera</th>
                  <th className="py-2">Site</th>
                  <th className="py-2">Time</th>
                  <th className="py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {events.map((event) => (
                  <tr key={event.id} className="border-b border-gray-100">
                    <td className="py-2">
                      <div className="font-semibold">{event.title}</div>
                      <div className="text-[10px] text-gray-500">
                        {event.description || "No description"}
                      </div>
                    </td>
                    <td className="py-2">{event.severity}</td>
                    <td className="py-2">{event.camera?.name || "-"}</td>
                    <td className="py-2">{event.camera?.site?.name || "-"}</td>
                    <td className="py-2">
                      {new Date(event.eventTime).toLocaleString()}
                    </td>
                    <td className="py-2">
                      {event.isAcknowledged ? "Acknowledged" : "Unacknowledged"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </PdfTemplate>
        </div>
      </div>
    </div>
  )
}
