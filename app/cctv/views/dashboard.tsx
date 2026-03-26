"use client";

import Link from "next/link";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageIntro } from "@/components/shared/page-intro";
import { StatusState } from "@/components/shared/status-state";
import { CCTVMetricStrip, CCTVRow, CCTVSurface } from "@/components/cctv/cctv-panels";
import { Camera as CameraIcon, CheckCircle, Server, Shield, Video, XCircle } from "@/lib/icons";
import { Camera, CCTVEvent, NVR, Site } from "@/lib/api";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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
  const onlineCameras = cameras.filter((camera) => camera.isOnline).length;
  const offlineCameras = cameras.filter((camera) => !camera.isOnline).length;
  const recordingCameras = cameras.filter((camera) => camera.isRecording).length;
  const highSecurityCameras = cameras.filter((camera) => camera.isHighSecurity).length;

  const onlineNVRs = nvrs.filter((nvr) => nvr.isOnline).length;
  const offlineNVRs = nvrs.filter((nvr) => !nvr.isOnline).length;

  const criticalEvents = events.filter((event) => event.severity === "CRITICAL").length;
  const highEvents = events.filter((event) => event.severity === "HIGH").length;
  const unacknowledgedEvents = events.filter((event) => !event.isAcknowledged).length;
  const allHealthy =
    cameras.length > 0 &&
    nvrs.length > 0 &&
    offlineCameras === 0 &&
    offlineNVRs === 0 &&
    unacknowledgedEvents === 0;

  const priorityCameras = [...cameras]
    .sort((a, b) => {
      const score = (camera: Camera) =>
        (camera.isHighSecurity ? 3 : 0) +
        (camera.isOnline ? 1 : -2) +
        (camera.isRecording ? 1 : 0);
      return score(b) - score(a);
    })
    .slice(0, 6);

  const recentEvents = [...events].sort(
    (a, b) => new Date(b.eventTime).getTime() - new Date(a.eventTime).getTime(),
  ).slice(0, 6);

  const latestNVRs = [...nvrs]
    .sort((a, b) => {
      const aTime = a.lastHeartbeat ? new Date(a.lastHeartbeat).getTime() : 0;
      const bTime = b.lastHeartbeat ? new Date(b.lastHeartbeat).getTime() : 0;
      return bTime - aTime;
    })
    .slice(0, 5);

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
    <div className="space-y-4">
      <PageIntro
        title="Overview"
        purpose="Track camera health, recorder status, and recent security activity across the mine."
        nextStep="Switch site focus, then jump into live monitoring or playback when something needs attention."
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/cctv/live">
                <Video className="mr-2 h-4 w-4" />
                Live Monitor
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/cctv/playback">
                <CameraIcon className="mr-2 h-4 w-4" />
                Playback
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/cctv/cameras/new">Register Camera</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/cctv/nvrs/new">Register NVR</Link>
            </Button>
          </>
        }
      />

      <CCTVSurface
        title="Control Strip"
        description="Keep the whole CCTV surface in view without drifting into setup-mode."
        contentClassName="space-y-4"
      >
        <div className="grid gap-3 xl:grid-cols-[1fr_auto] xl:items-end">
          <div className="space-y-2">
            <label className="text-field-label text-foreground" htmlFor="cctv-dashboard-site-filter">
              Site focus
            </label>
            <Select
              value={selectedSiteId}
              onValueChange={(value) => onSiteChange(value === "__all_sites__" ? "" : value)}
            >
              <SelectTrigger id="cctv-dashboard-site-filter" className="w-full xl:max-w-xs">
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
          <p className="text-sm text-muted-foreground">
            Showing {cameras.length} cameras, {nvrs.length} recorders, and {events.length} recent event(s).
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

        {!allHealthy ? (
          <Alert>
            <AlertTitle>Needs attention</AlertTitle>
            <AlertDescription>
              {offlineCameras > 0 ? `${offlineCameras} camera(s) offline. ` : ""}
              {offlineNVRs > 0 ? `${offlineNVRs} recorder(s) offline. ` : ""}
              {unacknowledgedEvents > 0 ? `${unacknowledgedEvents} unacknowledged event(s).` : ""}
            </AlertDescription>
          </Alert>
        ) : null}
      </CCTVSurface>

      <CCTVMetricStrip
        metrics={[
          {
            label: "Total Cameras",
            value: cameras.length.toLocaleString(),
            hint: `${onlineCameras} online, ${offlineCameras} offline`,
          },
          {
            label: "Recording",
            value: recordingCameras.toLocaleString(),
            hint:
              cameras.length > 0
                ? `${Math.round((recordingCameras / cameras.length) * 100)}% of cameras`
                : "No cameras",
          },
          {
            label: "NVRs",
            value: nvrs.length.toLocaleString(),
            hint: `${onlineNVRs} online, ${offlineNVRs} offline`,
          },
          {
            label: "Active Events",
            value: unacknowledgedEvents.toLocaleString(),
            hint: `${criticalEvents} critical, ${highEvents} high`,
            tone: unacknowledgedEvents > 0 ? "warning" : "success",
          },
        ]}
      />

      <div className="grid gap-4 xl:grid-cols-2">
        <CCTVSurface
          title="Priority Cameras"
          description="Offline cameras and high-security zones surface first."
          contentClassName="p-0"
        >
          {priorityCameras.length === 0 ? (
            <div className="px-4 py-6 text-sm text-muted-foreground">
              No cameras in view. Switch the site focus to reveal cameras for this location.
            </div>
          ) : (
            <div>
              {priorityCameras.map((camera) => (
                <CCTVRow
                  key={camera.id}
                  title={camera.name}
                  subtitle={`${camera.site?.name || "Unknown Site"} | ${camera.area} | Channel ${camera.channelNumber}`}
                  meta={
                    <>
                      <Badge variant={camera.isOnline ? "outline" : "destructive"}>
                        {camera.isOnline ? (
                          <CheckCircle className="mr-1 h-3 w-3" />
                        ) : (
                          <XCircle className="mr-1 h-3 w-3" />
                        )}
                        {camera.isOnline ? "Online" : "Offline"}
                      </Badge>
                      {camera.isHighSecurity ? (
                        <Badge variant="secondary">
                          <Shield className="mr-1 h-3 w-3" />
                          High Security
                        </Badge>
                      ) : null}
                      {camera.isRecording ? <Badge variant="secondary">Recording</Badge> : null}
                    </>
                  }
                  right={<span className="text-xs text-muted-foreground">Open in live view</span>}
                />
              ))}
            </div>
          )}
        </CCTVSurface>

        <div className="space-y-4">
          <CCTVSurface title="Recent Events" description="The latest issues needing review." contentClassName="p-0">
            {recentEvents.length === 0 ? (
              <div className="px-4 py-6 text-sm text-muted-foreground">
                No recent events. Activity from cameras and recorders will appear here.
              </div>
            ) : (
              <div>
                {recentEvents.map((event) => (
                  <CCTVRow
                    key={event.id}
                    title={event.title}
                    subtitle={`${event.camera?.site?.name || "Unknown Site"} | ${event.camera?.area || "Unknown area"} | ${new Date(event.eventTime).toLocaleString()}`}
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
                    right={<span className="text-xs text-muted-foreground">Review</span>}
                  />
                ))}
              </div>
            )}
          </CCTVSurface>

          <CCTVSurface
            title="Recorder Health"
            description="Quick scan of the most recent NVR heartbeat state."
            contentClassName="p-0"
          >
            {latestNVRs.length === 0 ? (
              <div className="px-4 py-6 text-sm text-muted-foreground">
                No recorders configured. Add an NVR to start checking recorder health here.
              </div>
            ) : (
              <div>
                {latestNVRs.map((nvr) => (
                  <CCTVRow
                    key={nvr.id}
                    title={nvr.name}
                    subtitle={`${nvr.site?.name || "Unknown Site"} | ${nvr.manufacturer}${nvr.model ? ` | ${nvr.model}` : ""}`}
                    meta={
                      <>
                        <Badge variant={nvr.isOnline ? "outline" : "destructive"}>
                          {nvr.isOnline ? "Online" : "Offline"}
                        </Badge>
                        <Badge variant="secondary">
                          <Server className="mr-1 h-3 w-3" />
                          {nvr._count?.cameras ?? 0} cameras
                        </Badge>
                      </>
                    }
                    right={
                      <span className="text-xs text-muted-foreground">
                        {nvr.lastHeartbeat ? new Date(nvr.lastHeartbeat).toLocaleString() : "No heartbeat"}
                      </span>
                    }
                  />
                ))}
              </div>
            )}
          </CCTVSurface>
        </div>
      </div>

      {highSecurityCameras > 0 ? (
        <CCTVSurface
          title="High-Security Cameras"
          description="Restricted-zone cameras stay visible without adding a special mode."
          contentClassName="p-0"
        >
          <div>
            {cameras
              .filter((camera) => camera.isHighSecurity)
              .slice(0, 5)
              .map((camera) => (
                <CCTVRow
                  key={camera.id}
                  title={camera.name}
                  subtitle={`${camera.area} | ${camera.site?.name || "Unknown Site"}`}
                  meta={
                    <>
                      <Badge variant={camera.isOnline ? "outline" : "destructive"}>
                        {camera.isOnline ? "Online" : "Offline"}
                      </Badge>
                      {camera.isRecording ? <Badge variant="secondary">Recording</Badge> : null}
                    </>
                  }
                  right={<span className="text-xs text-muted-foreground">Restricted</span>}
                />
              ))}
          </div>
        </CCTVSurface>
      ) : null}

      {events.length > 0 ? (
        <CCTVSurface title="Recent Activity" description="Most recent events in the selected view." contentClassName="p-0">
          <div>
            {events.slice(0, 5).map((event) => (
              <CCTVRow
                key={event.id}
                title={event.title}
                subtitle={event.description || "No description"}
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
                  </>
                }
                right={<span className="text-xs text-muted-foreground">{new Date(event.eventTime).toLocaleString()}</span>}
              />
            ))}
          </div>
        </CCTVSurface>
      ) : null}
    </div>
  );
}
