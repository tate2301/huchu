"use client";

import { NumberChart } from "@rtcamp/frappe-ui-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { PageIntro } from "@/components/shared/page-intro";
import { StatusState } from "@/components/shared/status-state";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buildNumberMetricConfig } from "@/lib/charts/frappe-config-builders";
import {
  Camera as CameraIcon,
  Server,
  AlertCircle,
  Shield,
} from "@/lib/icons";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Camera, NVR, CCTVEvent, Site } from "@/lib/api";

interface DashboardViewProps {
  cameras: Camera[];
  nvrs: NVR[];
  events: CCTVEvent[];
  sites: Site[];
  selectedSiteId: string;
  onSiteChange: (siteId: string) => void;
}

export function DashboardView({
  cameras,
  nvrs,
  events,
  sites,
  selectedSiteId,
  onSiteChange,
}: DashboardViewProps) {
  const onlineCameras = cameras.filter((c) => c.isOnline).length;
  const offlineCameras = cameras.filter((c) => !c.isOnline).length;
  const recordingCameras = cameras.filter((c) => c.isRecording).length;
  const highSecurityCameras = cameras.filter((c) => c.isHighSecurity).length;

  const onlineNVRs = nvrs.filter((n) => n.isOnline).length;
  const offlineNVRs = nvrs.filter((n) => !n.isOnline).length;

  const criticalEvents = events.filter((e) => e.severity === "CRITICAL").length;
  const highEvents = events.filter((e) => e.severity === "HIGH").length;
  const unacknowledgedEvents = events.filter((e) => !e.isAcknowledged).length;
  const allHealthy =
    cameras.length > 0 &&
    nvrs.length > 0 &&
    offlineCameras === 0 &&
    offlineNVRs === 0 &&
    unacknowledgedEvents === 0;
  const siteFilterId = "cctv-dashboard-site-filter";

  const totalCamerasMetric = buildNumberMetricConfig({
    title: "Total Cameras",
    value: cameras.length,
  });

  const recordingMetric = buildNumberMetricConfig({
    title: "Recording",
    value: recordingCameras,
  });

  const nvrMetric = buildNumberMetricConfig({
    title: "NVRs",
    value: nvrs.length,
  });

  const eventsMetric = buildNumberMetricConfig({
    title: "Active Events",
    value: unacknowledgedEvents,
    negativeIsBetter: true,
  });

  if (cameras.length === 0 && nvrs.length === 0 && events.length === 0) {
    return (
      <StatusState
        variant="empty"
        title="No CCTV equipment configured"
        description="Add at least one NVR and camera to start monitoring this site."
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageIntro
        title="Overview"
        purpose="Check CCTV health across cameras, recorders, and active security events."
        nextStep="Use site filter to focus on an operation area, then open live monitor or events."
      />

      <div className="flex flex-col gap-3 rounded-lg border bg-card p-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium" htmlFor={siteFilterId}>
            Filter by Site:
          </label>
          <Select
            value={selectedSiteId}
            onValueChange={(value) =>
              onSiteChange(value === "__all_sites__" ? "" : value)
            }
          >
            <SelectTrigger id={siteFilterId} className="w-[220px]">
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
        <p className="text-xs text-muted-foreground" role="status" aria-live="polite">
          Showing {cameras.length} cameras, {nvrs.length} NVRs, and {events.length} recent events.
        </p>
      </div>

      {allHealthy ? (
        <Alert variant="success">
          <AlertTitle>System healthy</AlertTitle>
          <AlertDescription>
            All listed cameras and NVRs are online with no unacknowledged events.
          </AlertDescription>
        </Alert>
      ) : null}

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-md border border-border/60 bg-card/70">
          <NumberChart
            config={totalCamerasMetric}
            subtitle={() => (
              <div className="flex flex-col gap-1">
                <div className="font-mono text-[24px] font-semibold leading-8 text-ink-gray-6 tabular-nums">
                  {cameras.length}
                </div>
                <div className="text-xs text-muted-foreground">
                  {onlineCameras} online, {offlineCameras} offline
                </div>
              </div>
            )}
          />
        </div>

        <div className="rounded-md border border-border/60 bg-card/70">
          <NumberChart
            config={recordingMetric}
            subtitle={() => (
              <div className="flex flex-col gap-1">
                <div className="font-mono text-[24px] font-semibold leading-8 text-ink-gray-6 tabular-nums">
                  {recordingCameras}
                </div>
                <div className="text-xs text-muted-foreground">
                  {cameras.length > 0
                    ? `${Math.round((recordingCameras / cameras.length) * 100)}% of cameras`
                    : "No cameras"}
                </div>
              </div>
            )}
          />
        </div>

        <div className="rounded-md border border-border/60 bg-card/70">
          <NumberChart
            config={nvrMetric}
            subtitle={() => (
              <div className="flex flex-col gap-1">
                <div className="font-mono text-[24px] font-semibold leading-8 text-ink-gray-6 tabular-nums">
                  {nvrs.length}
                </div>
                <div className="text-xs text-muted-foreground">
                  {onlineNVRs} online, {offlineNVRs} offline
                </div>
              </div>
            )}
          />
        </div>

        <div className="rounded-md border border-border/60 bg-card/70">
          <NumberChart
            config={eventsMetric}
            subtitle={() => (
              <div className="flex flex-col gap-1">
                <div className="font-mono text-[24px] font-semibold leading-8 text-ink-gray-6 tabular-nums">
                  {unacknowledgedEvents}
                </div>
                <div className="text-xs text-muted-foreground">
                  {criticalEvents} critical, {highEvents} high
                </div>
              </div>
            )}
          />
        </div>
      </div>

      {/* High Security Cameras */}
      {highSecurityCameras > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              High-Security Cameras
            </CardTitle>
            <CardDescription>
              Gold rooms, vaults, and other restricted areas
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {cameras
                .filter((c) => c.isHighSecurity)
                .slice(0, 5)
                .map((camera) => (
                  <div
                    key={camera.id}
                    className="flex items-center justify-between p-2 border rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <CameraIcon className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium">{camera.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {camera.area} | {camera.site?.name || "Unknown Site"}
                        </p>
                      </div>
                    </div>
                    <Badge
                      variant={camera.isOnline ? "outline" : "destructive"}
                      className="text-xs"
                    >
                      {camera.isOnline ? "Online" : "Offline"}
                    </Badge>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent Events */}
      {events.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recent Events</CardTitle>
            <CardDescription>
              Latest unacknowledged security events
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {events.slice(0, 5).map((event) => (
                <div
                  key={event.id}
                  className="flex items-center justify-between p-2 border rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <AlertCircle
                      className={`h-4 w-4 ${
                        event.severity === "CRITICAL"
                          ? "text-red-600"
                          : event.severity === "HIGH"
                            ? "text-orange-600"
                            : "text-yellow-600"
                      }`}
                    />
                    <div>
                      <p className="text-sm font-medium">{event.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {event.camera?.area || "Unknown"} |{" "}
                        {new Date(event.eventTime).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <Badge
                    variant={
                      event.severity === "CRITICAL"
                        ? "destructive"
                        : event.severity === "HIGH"
                          ? "outline"
                          : "secondary"
                    }
                    className="text-xs"
                  >
                    {event.severity}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty State */}
      {cameras.length === 0 && nvrs.length === 0 && events.length === 0 && (
        <Card>
          <CardHeader>
            <CardTitle>No CCTV Equipment Configured</CardTitle>
            <CardDescription>
              Get started by adding an NVR and configuring cameras
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center py-8">
            <Server className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-sm text-muted-foreground mb-4">
              Add your first NVR to begin monitoring your mine sites
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
