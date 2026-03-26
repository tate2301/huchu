"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  Camera,
  CCTVStreamSession,
  Site,
  fetchCCTVStreamSessions,
  startCCTVStreamSession,
  stopCCTVStreamSession,
  switchCCTVStreamProfile,
} from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api-client";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusState } from "@/components/shared/status-state";
import { useToast } from "@/components/ui/use-toast";
import { CCTVMetricStrip, CCTVSection, CCTVToolbar } from "@/components/cctv/cctv-panel";
import { StatusDot } from "@/components/ui/status-dot";
import { CheckCircle, Grid3x3, Plus, Video, X, XCircle } from "@/lib/icons";
import { cn } from "@/lib/utils";

type LiveMonitorViewProps = {
  sites: Site[];
  cameras: Camera[];
};

type GridDensity = 4 | 6 | 9 | 12;

function buildSessionMap(sessions: CCTVStreamSession[] | undefined) {
  const map = new Map<string, CCTVStreamSession>();
  if (!sessions) return map;
  sessions.filter((session) => session.status === "ACTIVE").forEach((session) => {
    map.set(session.cameraId, session);
  });
  return map;
}

function getGridClass(density: GridDensity) {
  switch (density) {
    case 4:
      return "grid-cols-1 md:grid-cols-2";
    case 6:
      return "grid-cols-1 md:grid-cols-2 xl:grid-cols-3";
    case 9:
      return "grid-cols-1 md:grid-cols-2 xl:grid-cols-3";
    case 12:
      return "grid-cols-1 md:grid-cols-2 xl:grid-cols-4";
    default:
      return "grid-cols-1 md:grid-cols-2";
  }
}

export function LiveMonitorView({ sites, cameras }: LiveMonitorViewProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [selectedSiteIds, setSelectedSiteIds] = useState<string[]>([]);
  const [selectedCameraIds, setSelectedCameraIds] = useState<string[]>([]);
  const [pickerCameraId, setPickerCameraId] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [streamProfiles, setStreamProfiles] = useState<Record<string, "main" | "sub" | "third">>({});
  const [focusedCameraId, setFocusedCameraId] = useState<string>("");
  const [layoutDensity, setLayoutDensity] = useState<GridDensity>(4);
  const [startingCameraId, setStartingCameraId] = useState<string | null>(null);
  const [stoppingSessionId, setStoppingSessionId] = useState<string | null>(null);
  const [switchingSessionId, setSwitchingSessionId] = useState<string | null>(null);

  const { data: sessionsData, isLoading: sessionsLoading, error: sessionsError } = useQuery({
    queryKey: ["cctv-stream-sessions", "ACTIVE"],
    queryFn: () => fetchCCTVStreamSessions({ status: "ACTIVE", limit: 200 }),
    refetchInterval: 15_000,
  });

  const activeSessionByCamera = useMemo(() => buildSessionMap(sessionsData?.data), [sessionsData?.data]);

  const filteredCameras = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return cameras
      .filter((camera) => camera.isActive)
      .filter((camera) => (selectedSiteIds.length === 0 ? true : selectedSiteIds.includes(camera.siteId)))
      .filter((camera) => {
        if (!term) return true;
        return (
          camera.name.toLowerCase().includes(term) ||
          camera.area.toLowerCase().includes(term) ||
          (camera.site?.name || "").toLowerCase().includes(term)
        );
      })
      .sort((a, b) => {
        const siteNameA = a.site?.name || "";
        const siteNameB = b.site?.name || "";
        if (siteNameA !== siteNameB) return siteNameA.localeCompare(siteNameB);
        if (a.area !== b.area) return a.area.localeCompare(b.area);
        return a.name.localeCompare(b.name);
      });
  }, [cameras, searchTerm, selectedSiteIds]);

  const defaultCameraIds = useMemo(() => filteredCameras.slice(0, layoutDensity).map((camera) => camera.id), [filteredCameras, layoutDensity]);
  const activeCameraIds = selectedCameraIds.length > 0 ? selectedCameraIds : defaultCameraIds;

  const selectedCameras = useMemo(() => {
    const byId = new Map(cameras.map((camera) => [camera.id, camera]));
    return activeCameraIds.map((cameraId) => byId.get(cameraId)).filter((camera): camera is Camera => Boolean(camera));
  }, [activeCameraIds, cameras]);

  const availableToAdd = useMemo(() => filteredCameras.filter((camera) => !activeCameraIds.includes(camera.id)), [activeCameraIds, filteredCameras]);

  const effectiveFocusedCameraId = focusedCameraId || selectedCameras[0]?.id || "";

  const focusedCamera = useMemo(() => {
    if (selectedCameras.length === 0) return null;
    return selectedCameras.find((camera) => camera.id === effectiveFocusedCameraId) ?? selectedCameras[0];
  }, [effectiveFocusedCameraId, selectedCameras]);

  const startSessionMutation = useMutation({
    mutationFn: (input: { cameraId: string; streamType: "main" | "sub" | "third" }) =>
      startCCTVStreamSession({
        cameraId: input.cameraId,
        streamType: input.streamType,
        preferredProtocol: "WEBRTC",
        purpose: "Live monitor",
      }),
    onMutate: (variables) => {
      setStartingCameraId(variables.cameraId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cctv-stream-sessions"] });
      toast({ title: "Live session started", description: "Stream session is now active." });
    },
    onError: (error) => {
      toast({ title: "Unable to start stream", description: getApiErrorMessage(error), variant: "destructive" });
    },
    onSettled: () => {
      setStartingCameraId(null);
    },
  });

  const stopSessionMutation = useMutation({
    mutationFn: (sessionId: string) => stopCCTVStreamSession(sessionId),
    onMutate: (sessionId) => {
      setStoppingSessionId(sessionId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cctv-stream-sessions"] });
      toast({ title: "Live session stopped", description: "Camera stream was closed successfully." });
    },
    onError: (error) => {
      toast({ title: "Unable to stop stream", description: getApiErrorMessage(error), variant: "destructive" });
    },
    onSettled: () => {
      setStoppingSessionId(null);
    },
  });

  const switchProfileMutation = useMutation({
    mutationFn: (input: { sessionId: string; streamType: "main" | "sub" | "third" }) =>
      switchCCTVStreamProfile({ sessionId: input.sessionId, streamType: input.streamType, preferredProtocol: "WEBRTC" }),
    onMutate: (variables) => {
      setSwitchingSessionId(variables.sessionId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cctv-stream-sessions"] });
      toast({ title: "Stream profile updated", description: "The live stream quality profile was changed." });
    },
    onError: (error) => {
      toast({ title: "Unable to switch stream profile", description: getApiErrorMessage(error), variant: "destructive" });
    },
    onSettled: () => {
      setSwitchingSessionId(null);
    },
  });

  const toggleSite = (siteId: string) => {
    setSelectedSiteIds((prev) => (prev.includes(siteId) ? prev.filter((id) => id !== siteId) : [...prev, siteId]));
  };

  const addCameraToGrid = () => {
    if (!pickerCameraId || activeCameraIds.includes(pickerCameraId)) return;
    setSelectedCameraIds((prev) => {
      const base = prev.length > 0 ? prev : defaultCameraIds;
      if (base.includes(pickerCameraId)) return base;
      return [...base, pickerCameraId];
    });
    setPickerCameraId("");
  };

  const removeCameraFromGrid = (cameraId: string) => {
    setSelectedCameraIds((prev) => {
      const base = prev.length > 0 ? prev : defaultCameraIds;
      return base.filter((id) => id !== cameraId);
    });
  };

  const onProfileChange = (cameraId: string, profile: "main" | "sub" | "third") => {
    setStreamProfiles((prev) => ({ ...prev, [cameraId]: profile }));
    const activeSession = activeSessionByCamera.get(cameraId);
    if (activeSession) {
      switchProfileMutation.mutate({ sessionId: activeSession.id, streamType: profile });
    }
  };

  const startAllVisible = () => {
    selectedCameras.forEach((camera) => {
      if (activeSessionByCamera.has(camera.id)) return;
      const profile = streamProfiles[camera.id] || "sub";
      startSessionMutation.mutate({ cameraId: camera.id, streamType: profile });
    });
  };

  const stopAllActive = () => {
    activeSessionByCamera.forEach((session) => {
      stopSessionMutation.mutate(session.id);
    });
  };

  if (sessionsError) {
    return <StatusState variant="error" title="Unable to load active stream sessions" description={getApiErrorMessage(sessionsError)} />;
  }

  const activeSessionsCount = activeSessionByCamera.size;
  const onlineVisibleCount = selectedCameras.filter((camera) => camera.isOnline).length;
  const offlineVisibleCount = selectedCameras.length - onlineVisibleCount;

  return (
    <div className="space-y-5">
      <section className="rounded-3xl border border-[var(--edge-default)] bg-[linear-gradient(135deg,var(--surface-base)_0%,var(--surface-muted)_100%)] p-5 shadow-[var(--surface-frame-shadow)] sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">CCTV / Live Monitor</p>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">Live Monitor</h1>
            <p className="max-w-3xl text-sm text-muted-foreground">
              Run and supervise multiple live camera streams across mine sites. Keep the grid lean, keep the focus visible, and move quickly between cameras that matter.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline"><Link href="/cctv/cameras/new">Register Camera</Link></Button>
            <Button asChild variant="outline"><Link href="/cctv/nvrs/new">Register NVR</Link></Button>
          </div>
        </div>

        <div className="mt-5">
          <CCTVMetricStrip
            stats={[
              { label: "Visible cameras", value: selectedCameras.length, detail: `${onlineVisibleCount} online, ${offlineVisibleCount} offline` },
              { label: "Active sessions", value: activeSessionsCount, detail: sessionsLoading ? "Refreshing session list" : "Updated every 15 seconds", tone: activeSessionsCount > 0 ? "success" : "default" },
              { label: "Selected sites", value: selectedSiteIds.length === 0 ? "All" : selectedSiteIds.length, detail: selectedSiteIds.length === 0 ? "Monitoring all sites" : "Filtered site scope" },
              { label: "Layout density", value: `${layoutDensity}`, detail: "Controls tile spacing and scan depth" },
            ]}
          />
        </div>
      </section>

      {!sessionsLoading && activeSessionsCount > 0 ? (
        <Alert variant="success">
          <AlertTitle>Live sessions active</AlertTitle>
          <AlertDescription>{activeSessionsCount} stream session(s) currently running across selected cameras.</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_360px]">
        <div className="space-y-4">
          <CCTVSection
            eyebrow="monitor wall"
            title={`Active grid (${selectedCameras.length})`}
            description="Choose the camera set, tune the tile density, and keep the active feeds in one place."
            actions={
              <div className="flex flex-wrap items-center gap-2">
                {[4, 6, 9, 12].map((density) => (
                  <Button key={density} type="button" size="sm" variant={layoutDensity === density ? "default" : "outline"} onClick={() => setLayoutDensity(density as GridDensity)} className="gap-1.5">
                    <Grid3x3 className="h-4 w-4" />
                    {density}
                  </Button>
                ))}
              </div>
            }
          >
            <div className="space-y-4 px-4 pb-4 sm:px-5">
              <CCTVToolbar>
                <div className="flex flex-1 flex-wrap items-center gap-2">
                  <Button type="button" size="sm" variant={selectedSiteIds.length === 0 ? "default" : "outline"} onClick={() => setSelectedSiteIds([])}>All Sites</Button>
                  {sites.map((site) => (
                    <Button key={site.id} type="button" size="sm" variant={selectedSiteIds.includes(site.id) ? "default" : "outline"} onClick={() => toggleSite(site.id)}>
                      {site.name}
                    </Button>
                  ))}
                </div>
                <div className="flex min-w-[240px] flex-1 items-center gap-2">
                  <Input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Search camera, site, or area" />
                </div>
              </CCTVToolbar>

              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
                <Select value={pickerCameraId} onValueChange={setPickerCameraId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Add another camera to the wall" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableToAdd.map((camera) => (
                      <SelectItem key={camera.id} value={camera.id}>{camera.site?.name || "Unknown Site"} | {camera.area} | {camera.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button type="button" onClick={addCameraToGrid} disabled={!pickerCameraId}><Plus className="mr-2 h-4 w-4" />Add Camera</Button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" variant="outline" onClick={startAllVisible} disabled={selectedCameras.length === 0}>Start All</Button>
                <Button type="button" variant="outline" onClick={stopAllActive} disabled={activeSessionsCount === 0}>Stop All</Button>
                <p className="text-xs text-muted-foreground">Showing {selectedCameras.length} camera(s) in the grid, with {activeSessionsCount} active session(s).</p>
              </div>

              {selectedCameras.length === 0 ? (
                <StatusState variant="empty" title="No cameras in the live grid" description="Add at least one camera or clear the filters to begin live monitoring." />
              ) : (
                <div className={cn("grid gap-3", getGridClass(layoutDensity))}>
                  {selectedCameras.map((camera) => {
                    const activeSession = activeSessionByCamera.get(camera.id);
                    const streamProfile = streamProfiles[camera.id] || "sub";
                    const isStarting = startingCameraId === camera.id;
                    const isStopping = activeSession ? stoppingSessionId === activeSession.id : false;
                    const isSwitching = activeSession ? switchingSessionId === activeSession.id : false;
                    const isFocused = focusedCamera?.id === camera.id;

                    return (
                      <div key={camera.id} className={cn("rounded-2xl border border-[var(--edge-default)] bg-[var(--surface-base)] p-3 transition-colors duration-200", isFocused ? "ring-2 ring-[var(--action-primary-bg)]/30" : "") }>
                        <div className="flex items-start justify-between gap-2">
                          <button type="button" className="min-w-0 text-left" onClick={() => setFocusedCameraId(camera.id)}>
                            <div className="flex items-center gap-2">
                              <h3 className="truncate text-sm font-semibold text-foreground">{camera.name}</h3>
                              {camera.isHighSecurity ? <Badge variant="secondary" className="rounded-full text-[10px]">High security</Badge> : null}
                            </div>
                            <p className="mt-1 truncate text-xs text-muted-foreground">{camera.site?.name || "Unknown Site"} | {camera.area}</p>
                          </button>
                          <div className="flex items-center gap-2">
                            <Badge variant={camera.isOnline ? "outline" : "destructive"} className="rounded-full">
                              {camera.isOnline ? <CheckCircle className="mr-1 h-3 w-3" /> : <XCircle className="mr-1 h-3 w-3" />}
                              {camera.isOnline ? "Online" : "Offline"}
                            </Badge>
                            <Button type="button" size="icon" variant="ghost" onClick={() => removeCameraFromGrid(camera.id)} aria-label={`Remove ${camera.name} from grid`}>
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>

                        <div className="mt-3 rounded-xl border border-dashed border-[var(--edge-default)] bg-[var(--surface-muted)]/70 p-3">
                          <div className="flex items-center justify-between gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                            <span>Preview</span>
                            <span>{streamProfile} stream</span>
                          </div>
                          <div className="mt-3 flex min-h-28 items-center justify-center rounded-xl border border-[var(--edge-default)] bg-[linear-gradient(180deg,var(--surface-base)_0%,var(--surface-muted)_100%)] px-3 text-center">
                            <div className="space-y-2">
                              <div className="flex items-center justify-center gap-2 text-sm font-medium text-foreground">
                                {activeSession ? <><Video className="h-4 w-4 text-[var(--status-success-text)]" />Live session running</> : <><StatusDot status={camera.isOnline ? "active" : "inactive"} />{camera.isOnline ? "Ready to start" : "Camera offline"}</>}
                              </div>
                              <p className="text-xs text-muted-foreground">
                                {activeSession ? `Session active since ${new Date(activeSession.startedAt).toLocaleString()}` : "No active session yet. Start live view to bring this feed online."}
                              </p>
                              {activeSession?.playUrl ? (
                                <Button asChild size="sm" variant="outline"><a href={activeSession.playUrl} target="_blank" rel="noreferrer">Open stream endpoint</a></Button>
                              ) : null}
                            </div>
                          </div>
                        </div>

                        <div className="mt-3 space-y-3">
                          <div className="space-y-1">
                            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Stream Profile</div>
                            <Select value={streamProfile} onValueChange={(value) => onProfileChange(camera.id, value as "main" | "sub" | "third")}>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="sub">Sub stream for grid</SelectItem>
                                <SelectItem value="main">Main stream for detail</SelectItem>
                                <SelectItem value="third">Third stream</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            {activeSession ? (
                              <Button type="button" variant="outline" onClick={() => stopSessionMutation.mutate(activeSession.id)} disabled={isStopping}>{isStopping ? "Stopping..." : "Stop Live"}</Button>
                            ) : (
                              <Button type="button" onClick={() => startSessionMutation.mutate({ cameraId: camera.id, streamType: streamProfile })} disabled={!camera.isOnline || isStarting}>
                                <Video className="mr-2 h-4 w-4" />
                                {isStarting ? "Starting..." : "Start Live"}
                              </Button>
                            )}
                            <Button type="button" variant={isFocused ? "default" : "ghost"} onClick={() => setFocusedCameraId(camera.id)}>Focus</Button>
                            {isSwitching ? <span className="text-xs text-muted-foreground">Switching profile...</span> : null}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </CCTVSection>
        </div>

        <aside className="space-y-4">
          <CCTVSection eyebrow="session rail" title="Selection" description="Keep the current wall, add cameras, and move quickly between active streams.">
            <div className="space-y-3 px-4 pb-4 sm:px-5">
              <div className="rounded-2xl border border-[var(--edge-default)] bg-[var(--surface-muted)]/60 p-3">
                <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Selected cameras</div>
                <div className="mt-2 space-y-1.5">
                  {selectedCameras.length > 0 ? selectedCameras.map((camera) => {
                    const active = focusedCamera?.id === camera.id;
                    return (
                      <Button key={camera.id} type="button" variant={active ? "default" : "ghost"} className="h-auto w-full justify-between px-3 py-2 text-left" onClick={() => setFocusedCameraId(camera.id)}>
                        <span className="min-w-0 truncate text-sm">{camera.name}</span>
                        <span className="ml-2 text-[10px] text-muted-foreground">{camera.area}</span>
                      </Button>
                    );
                  }) : <p className="text-sm text-muted-foreground">No cameras pinned yet.</p>}
                </div>
              </div>

              <div className="rounded-2xl border border-[var(--edge-default)] bg-[var(--surface-muted)]/60 p-3">
                <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Add camera</div>
                <div className="mt-2 space-y-2">
                  <Select value={pickerCameraId} onValueChange={setPickerCameraId}>
                    <SelectTrigger><SelectValue placeholder="Choose camera" /></SelectTrigger>
                    <SelectContent>
                      {availableToAdd.map((camera) => (
                        <SelectItem key={camera.id} value={camera.id}>{camera.site?.name || "Unknown Site"} | {camera.area} | {camera.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button type="button" onClick={addCameraToGrid} disabled={!pickerCameraId} className="w-full"><Plus className="mr-2 h-4 w-4" />Add to wall</Button>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={startAllVisible} disabled={selectedCameras.length === 0}>Start all visible</Button>
                <Button type="button" variant="outline" onClick={stopAllActive} disabled={activeSessionsCount === 0}>Stop all active</Button>
              </div>
            </div>
          </CCTVSection>

          <CCTVSection eyebrow="focus" title={focusedCamera?.name || "No camera selected"} description={focusedCamera ? `${focusedCamera.site?.name || "Unknown Site"} | ${focusedCamera.area}` : "Choose a camera tile to inspect its state and control the stream."}>
            <div className="space-y-3 px-4 pb-4 sm:px-5">
              {focusedCamera ? (
                <>
                  <div className="grid gap-2 text-sm">
                    <div className="flex items-center justify-between gap-3"><span className="text-muted-foreground">Status</span><span className="flex items-center gap-2 font-medium"><StatusDot status={focusedCamera.isOnline ? "active" : "inactive"} />{focusedCamera.isOnline ? "Online" : "Offline"}</span></div>
                    <div className="flex items-center justify-between gap-3"><span className="text-muted-foreground">Current profile</span><span className="font-medium">{streamProfiles[focusedCamera.id] || "sub"}</span></div>
                    <div className="flex items-center justify-between gap-3"><span className="text-muted-foreground">Active session</span><span className="font-medium">{activeSessionByCamera.has(focusedCamera.id) ? "Running" : "Idle"}</span></div>
                    <div className="flex items-center justify-between gap-3"><span className="text-muted-foreground">Last seen</span><span className="font-medium">{focusedCamera.lastSeen ? new Date(focusedCamera.lastSeen).toLocaleString() : "Unknown"}</span></div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {activeSessionByCamera.get(focusedCamera.id)?.playUrl ? (
                      <Button asChild size="sm" variant="outline"><a href={activeSessionByCamera.get(focusedCamera.id)?.playUrl || "#"} target="_blank" rel="noreferrer">Open stream</a></Button>
                    ) : null}
                    <Button type="button" size="sm" variant="outline" onClick={() => setFocusedCameraId(focusedCamera.id)}>Keep focus</Button>
                  </div>
                </>
              ) : (
                <StatusState variant="empty" title="No camera selected" description="Pick a tile from the wall to inspect stream state, profile, and quick actions." />
              )}
            </div>
          </CCTVSection>
        </aside>
      </div>
    </div>
  );
}
