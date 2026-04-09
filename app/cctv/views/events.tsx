"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExportMenu } from "@/components/ui/export-menu";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FieldHelp } from "@/components/shared/field-help";
import { PageIntro } from "@/components/shared/page-intro";
import { StatusState } from "@/components/shared/status-state";
import { CCTVMetricStrip, CCTVRow, CCTVSurface } from "@/components/cctv/cctv-panels";
import { fetchCCTVEvents, Site } from "@/lib/api";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { type DocumentExportFormat } from "@/lib/documents/export-client";
import { exportElementToDocument } from "@/lib/pdf";
import { AlertCircle, CheckCircle, Clock, Camera as CameraIcon, Video } from "@/lib/icons";

interface EventsViewProps {
  sites: Site[];
  selectedSiteId: string;
  onSiteChange: (siteId: string) => void;
}

export function EventsView({ sites, selectedSiteId, onSiteChange }: EventsViewProps) {
  const eventsPdfRef = useRef<HTMLDivElement | null>(null);
  const [severityFilter, setSeverityFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("unacknowledged");
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [acknowledgeNotes, setAcknowledgeNotes] = useState("");
  const siteFilterId = "cctv-events-site-filter";
  const severityFilterId = "cctv-events-severity-filter";
  const statusFilterId = "cctv-events-status-filter";
  const acknowledgeNotesId = "cctv-event-acknowledge-notes";
  const acknowledgeNotesHelpId = "cctv-event-acknowledge-notes-help";

  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["cctv-events", selectedSiteId, severityFilter, statusFilter],
    queryFn: () =>
      fetchCCTVEvents({
        siteId: selectedSiteId || undefined,
        severity: severityFilter || undefined,
        isAcknowledged:
          statusFilter === "acknowledged" ? true : statusFilter === "unacknowledged" ? false : undefined,
        limit: 50,
      }),
  });

  const acknowledgeMutation = useMutation({
    mutationFn: async ({ eventId, notes }: { eventId: string; notes: string }) => {
      return fetchJson("/api/cctv/events", {
        method: "PATCH",
        body: JSON.stringify({ eventId, notes }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cctv-events"] });
      setAcknowledgeNotes("");
    },
  });

  const escalateMutation = useMutation({
    mutationFn: async ({ eventId }: { eventId: string }) => {
      return fetchJson("/api/cctv/events", {
        method: "PATCH",
        body: JSON.stringify({
          eventId,
          action: "escalate",
          notes: "Escalated from CCTV events view",
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cctv-events"] });
    },
  });

  const events = useMemo(() => data?.data ?? [], [data]);
  const selectedSiteName = sites.find((site) => site.id === selectedSiteId)?.name;
  const activeSiteName = selectedSiteName || "All Sites";
  const acknowledgedCount = events.filter((event) => event.isAcknowledged).length;
  const unacknowledgedCount = events.filter((event) => !event.isAcknowledged).length;
  const criticalCount = events.filter((event) => event.severity === "CRITICAL").length;
  const exportDisabled = isLoading || events.length === 0;

  const selectedEvent =
    events.find((event) => event.id === selectedEventId) ?? events[0] ?? null;

  const resetFilters = () => {
    onSiteChange("");
    setSeverityFilter("");
    setStatusFilter("unacknowledged");
  };

  if (error) {
    return (
      <StatusState
        variant="error"
        title="Unable to load events"
      />
    );
  }

  return (
    <div className="space-y-4">
      <PageIntro
        title="Events"
        purpose="Review security alerts from camera and recorder systems."
        nextStep="Filter by site and severity, then acknowledge or escalate active events."
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/cctv/live">
                <Video className="mr-2 h-4 w-4" />
                Open Live
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/cctv/playback">
                <CameraIcon className="mr-2 h-4 w-4" />
                Open Playback
              </Link>
            </Button>
          </>
        }
      />

      <CCTVSurface
        title="Triage Controls"
        actions={
          <ExportMenu
            variant="outline"
            size="sm"
            disabled={exportDisabled}
            onExport={(format: DocumentExportFormat) => {
              if (!eventsPdfRef.current) return;
              return exportElementToDocument(
                eventsPdfRef.current,
                `cctv-events-${new Date().toISOString().slice(0, 10)}.${format}`,
                format,
              );
            }}
          />
        }
      >
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="space-y-2">
            <label className="text-field-label text-foreground" htmlFor={siteFilterId}>
              Site
            </label>
            <Select
              value={selectedSiteId}
              onValueChange={(value) => onSiteChange(value === "__all_sites__" ? "" : value)}
            >
              <SelectTrigger id={siteFilterId}>
                <SelectValue placeholder="All Sites" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all_sites__">All Sites</SelectItem>
                {sites.map((site) => (
                  <SelectItem key={site.id} value={site.id}>
                    {site.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-field-label text-foreground" htmlFor={severityFilterId}>
              Severity
            </label>
            <Select
              value={severityFilter}
              onValueChange={(value) => setSeverityFilter(value === "__all_severities__" ? "" : value)}
            >
              <SelectTrigger id={severityFilterId}>
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

          <div className="space-y-2">
            <label className="text-field-label text-foreground" htmlFor={statusFilterId}>
              Status
            </label>
            <Select
              value={statusFilter}
              onValueChange={(value) => setStatusFilter(value === "__all_status__" ? "" : value)}
            >
              <SelectTrigger id={statusFilterId}>
                <SelectValue placeholder="All Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all_status__">All Status</SelectItem>
                <SelectItem value="unacknowledged">Unacknowledged</SelectItem>
                <SelectItem value="acknowledged">Acknowledged</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-end gap-2">
            {(selectedSiteId || severityFilter || statusFilter !== "unacknowledged") && (
              <Button variant="ghost" size="sm" onClick={resetFilters}>
                Clear Filters
              </Button>
            )}
            <p className="text-sm text-muted-foreground">
              {events.length} event(s) in {activeSiteName}
            </p>
          </div>
        </div>
      </CCTVSurface>

      <CCTVMetricStrip
        metrics={[
          {
            label: "Total Events",
            value: events.length.toLocaleString(),
            hint: `${acknowledgedCount} acknowledged`,
          },
          {
            label: "Open Events",
            value: unacknowledgedCount.toLocaleString(),
            hint: "Requires review",
            tone: unacknowledgedCount > 0 ? "warning" : "success",
          },
          {
            label: "Critical",
            value: criticalCount.toLocaleString(),
            hint: "Highest priority",
            tone: criticalCount > 0 ? "danger" : "muted",
          },
          {
            label: "Selected Site",
            value: activeSiteName,
            hint: selectedSiteId ? "Filtered view" : "All sites",
          },
        ]}
      />

      {isLoading ? (
        <StatusState
          variant="loading"
          title="Loading events"
        />
      ) : events.length === 0 ? (
        statusFilter === "unacknowledged" ? (
          <StatusState
            variant="success"
            title="No unacknowledged events"
          />
        ) : (
          <StatusState
            variant="empty"
            title="No events found"
          />
        )
      ) : (
        <div className="grid gap-4 xl:grid-cols-[1.3fr_0.9fr]">
          <CCTVSurface title="Event Queue" contentClassName="p-0">
            <div className="max-h-[68vh] overflow-y-auto">
              {events.map((event) => (
                <CCTVRow
                  key={event.id}
                  onClick={() => {
                    setSelectedEventId(event.id);
                    setAcknowledgeNotes("");
                  }}
                  active={selectedEvent?.id === event.id}
                  title={event.title}
                  meta={
                    <>
                      <Badge
                        variant={
                          event.severity === "CRITICAL"
                            ? "destructive"
                            : event.severity === "HIGH"
                              ? "outline"
                              : "secondary"
                        }
                      >
                        {event.severity}
                      </Badge>
                      <Badge variant={event.isAcknowledged ? "secondary" : "outline"}>
                        {event.isAcknowledged ? "Acknowledged" : "Open"}
                      </Badge>
                    </>
                  }
                  right={<span className="text-xs text-muted-foreground">Inspect</span>}
                />
              ))}
            </div>
          </CCTVSurface>

          <CCTVSurface
            title="Event Details"
            contentClassName="space-y-4"
          >
            {selectedEvent ? (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    variant={
                      selectedEvent.severity === "CRITICAL"
                        ? "destructive"
                        : selectedEvent.severity === "HIGH"
                          ? "outline"
                          : "secondary"
                    }
                  >
                    {selectedEvent.severity}
                  </Badge>
                  <Badge variant={selectedEvent.isAcknowledged ? "secondary" : "outline"}>
                    {selectedEvent.isAcknowledged ? "Acknowledged" : "Open"}
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    {new Date(selectedEvent.eventTime).toLocaleString()}
                  </span>
                </div>

                <div className="space-y-2">
                  <p className="text-base font-semibold text-foreground">{selectedEvent.title}</p>
                  <p className="text-sm text-muted-foreground">
                    {selectedEvent.description || "No description recorded for this event."}
                  </p>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-[var(--edge-subtle)] p-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      Camera
                    </p>
                    <p className="mt-2 text-sm font-medium text-foreground">
                      {selectedEvent.camera?.name || "System event"}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {selectedEvent.camera?.site?.name || "Unknown site"}
                      {selectedEvent.camera?.area ? ` | ${selectedEvent.camera.area}` : ""}
                    </p>
                  </div>
                  <div className="rounded-xl border border-[var(--edge-subtle)] p-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      Event Time
                    </p>
                    <p className="mt-2 text-sm font-medium text-foreground">
                      {new Date(selectedEvent.eventTime).toLocaleString()}
                    </p>
                    <p className="text-sm text-muted-foreground">Security review timestamp</p>
                  </div>
                </div>

                {!selectedEvent.isAcknowledged ? (
                  <div className="space-y-3 rounded-xl border border-[var(--edge-subtle)] p-3">
                    <label className="text-field-label text-foreground" htmlFor={acknowledgeNotesId}>
                      Acknowledge notes
                    </label>
                    <Textarea
                      id={acknowledgeNotesId}
                      placeholder="Add notes before closing this event..."
                      value={acknowledgeNotes}
                      onChange={(event) => setAcknowledgeNotes(event.target.value)}
                      rows={4}
                      aria-describedby={acknowledgeNotesHelpId}
                    />
                    <FieldHelp
                      id={acknowledgeNotesHelpId}
                      hint="Keep it short and specific. Mention what was checked before acknowledging."
                    />
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        onClick={() =>
                          acknowledgeMutation.mutate({
                            eventId: selectedEvent.id,
                            notes: acknowledgeNotes,
                          })
                        }
                        disabled={acknowledgeMutation.isPending}
                      >
                        <CheckCircle className="mr-2 h-4 w-4" />
                        {acknowledgeMutation.isPending ? "Acknowledging..." : "Acknowledge"}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => escalateMutation.mutate({ eventId: selectedEvent.id })}
                        disabled={escalateMutation.isPending}
                      >
                        <AlertCircle className="mr-2 h-4 w-4" />
                        {escalateMutation.isPending ? "Escalating..." : "Escalate"}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Alert variant="success">
                    <AlertTitle>Already acknowledged</AlertTitle>
                    <AlertDescription>
                      This event has been reviewed and is no longer pending.
                    </AlertDescription>
                  </Alert>
                )}

                <div className="flex flex-wrap gap-2">
                  <Button asChild variant="outline">
                    <Link href="/cctv/live">
                      <Video className="mr-2 h-4 w-4" />
                      Open Live Monitor
                    </Link>
                  </Button>
                  <Button asChild variant="outline">
                    <Link href="/cctv/playback">
                      <Clock className="mr-2 h-4 w-4" />
                      Open Playback
                    </Link>
                  </Button>
                </div>
              </>
            ) : (
              <StatusState
                variant="empty"
                title="No event selected"
              />
            )}
          </CCTVSurface>
        </div>
      )}

      <div className="absolute left-[-9999px] top-0">
        <div ref={eventsPdfRef}>
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
                    <div className="text-[10px] text-gray-500">{event.description || "No description"}</div>
                  </td>
                  <td className="py-2">{event.severity}</td>
                  <td className="py-2">{event.camera?.name || "-"}</td>
                  <td className="py-2">{event.camera?.site?.name || "-"}</td>
                  <td className="py-2">{new Date(event.eventTime).toLocaleString()}</td>
                  <td className="py-2">{event.isAcknowledged ? "Acknowledged" : "Unacknowledged"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
