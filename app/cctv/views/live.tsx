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
import { PageIntro } from "@/components/shared/page-intro";
import { StatusState } from "@/components/shared/status-state";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { CheckCircle, Plus, Video, X, XCircle } from "@/lib/icons";

type LiveMonitorViewProps = {
  sites: Site[];
  cameras: Camera[];
};

function buildSessionMap(sessions: CCTVStreamSession[] | undefined) {
  const map = new Map<string, CCTVStreamSession>();
  if (!sessions) return map;
  sessions
    .filter((session) => session.status === "ACTIVE")
    .forEach((session) => {
      map.set(session.cameraId, session);
    });
  return map;
}

export function LiveMonitorView({ sites, cameras }: LiveMonitorViewProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [selectedSiteIds, setSelectedSiteIds] = useState<string[]>([]);
  const [selectedCameraIds, setSelectedCameraIds] = useState<string[]>([]);
  const [pickerCameraId, setPickerCameraId] = useState<string>("");
  const [streamProfiles, setStreamProfiles] = useState<Record<string, "main" | "sub" | "third">>({});
  const [startingCameraId, setStartingCameraId] = useState<string | null>(null);
  const [stoppingSessionId, setStoppingSessionId] = useState<string | null>(null);
  const [switchingSessionId, setSwitchingSessionId] = useState<string | null>(null);

  const {
    data: sessionsData,
    isLoading: sessionsLoading,
    error: sessionsError,
  } = useQuery({
    queryKey: ["cctv-stream-sessions", "ACTIVE"],
    queryFn: () => fetchCCTVStreamSessions({ status: "ACTIVE", limit: 200 }),
    refetchInterval: 15_000,
  });

  const activeSessionByCamera = useMemo(
    () => buildSessionMap(sessionsData?.data),
    [sessionsData?.data],
  );

  const filteredCameras = useMemo(() => {
    return cameras
      .filter((camera) => camera.isActive)
      .filter((camera) =>
        selectedSiteIds.length === 0 ? true : selectedSiteIds.includes(camera.siteId),
      )
      .sort((a, b) => {
        const siteNameA = a.site?.name || "";
        const siteNameB = b.site?.name || "";
        if (siteNameA !== siteNameB) return siteNameA.localeCompare(siteNameB);
        if (a.area !== b.area) return a.area.localeCompare(b.area);
        return a.name.localeCompare(b.name);
      });
  }, [cameras, selectedSiteIds]);

  const defaultCameraIds = useMemo(
    () => filteredCameras.slice(0, 4).map((camera) => camera.id),
    [filteredCameras],
  );

  const activeCameraIds = selectedCameraIds.length > 0 ? selectedCameraIds : defaultCameraIds;

  const selectedCameras = useMemo(() => {
    const byId = new Map(cameras.map((camera) => [camera.id, camera]));
    return activeCameraIds
      .map((cameraId) => byId.get(cameraId))
      .filter((camera): camera is Camera => Boolean(camera));
  }, [activeCameraIds, cameras]);

  const availableToAdd = useMemo(
    () => filteredCameras.filter((camera) => !activeCameraIds.includes(camera.id)),
    [activeCameraIds, filteredCameras],
  );

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
      toast({
        title: "Live session started",
        description: "Stream session is now active.",
      });
    },
    onError: (error) => {
      toast({
        title: "Unable to start stream",
        description: getApiErrorMessage(error),
        variant: "destructive",
      });
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
      toast({
        title: "Live session stopped",
        description: "Camera stream was closed successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Unable to stop stream",
        description: getApiErrorMessage(error),
        variant: "destructive",
      });
    },
    onSettled: () => {
      setStoppingSessionId(null);
    },
  });

  const switchProfileMutation = useMutation({
    mutationFn: (input: { sessionId: string; streamType: "main" | "sub" | "third" }) =>
      switchCCTVStreamProfile({
        sessionId: input.sessionId,
        streamType: input.streamType,
        preferredProtocol: "WEBRTC",
      }),
    onMutate: (variables) => {
      setSwitchingSessionId(variables.sessionId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cctv-stream-sessions"] });
      toast({
        title: "Stream profile updated",
        description: "The live stream quality profile was changed.",
      });
    },
    onError: (error) => {
      toast({
        title: "Unable to switch stream profile",
        description: getApiErrorMessage(error),
        variant: "destructive",
      });
    },
    onSettled: () => {
      setSwitchingSessionId(null);
    },
  });

  const toggleSite = (siteId: string) => {
    setSelectedSiteIds((prev) =>
      prev.includes(siteId) ? prev.filter((id) => id !== siteId) : [...prev, siteId],
    );
  };

  const addCameraToGrid = () => {
    if (!pickerCameraId || activeCameraIds.includes(pickerCameraId)) return;
    setSelectedCameraIds((prev) => {
      const base = prev.length > 0 ? prev : defaultCameraIds;
      if (base.includes(pickerCameraId)) {
        return base;
      }
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
      switchProfileMutation.mutate({
        sessionId: activeSession.id,
        streamType: profile,
      });
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
    return (
      <StatusState
        variant="error"
        title="Unable to load active stream sessions"
        description={getApiErrorMessage(sessionsError)}
      />
    );
  }

  return (
    <div className="space-y-4">
      <PageIntro
        title="Live Monitor"
        purpose="Run and supervise multiple live camera streams across multiple mine sites."
        nextStep="Select sites, add cameras to the grid, and start live sessions."
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/cctv/cameras/new">Register Camera</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/cctv/nvrs/new">Register NVR</Link>
            </Button>
          </>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Monitor Setup</CardTitle>
          <CardDescription>Choose sites and build a live camera grid for this session.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <p className="text-sm font-semibold">Sites</p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant={selectedSiteIds.length === 0 ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedSiteIds([])}
              >
                All Sites
              </Button>
              {sites.map((site) => (
                <Button
                  key={site.id}
                  type="button"
                  variant={selectedSiteIds.includes(site.id) ? "default" : "outline"}
                  size="sm"
                  onClick={() => toggleSite(site.id)}
                >
                  {site.name}
                </Button>
              ))}
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-[1fr_auto]">
            <Select value={pickerCameraId} onValueChange={setPickerCameraId}>
              <SelectTrigger>
                <SelectValue placeholder="Select camera to add to live grid" />
              </SelectTrigger>
              <SelectContent>
                {availableToAdd.map((camera) => (
                  <SelectItem key={camera.id} value={camera.id}>
                    {camera.site?.name || "Unknown Site"} | {camera.area} | {camera.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="button" onClick={addCameraToGrid} disabled={!pickerCameraId}>
              <Plus className="mr-2 h-4 w-4" />
              Add Camera
            </Button>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={startAllVisible} disabled={selectedCameras.length === 0}>
              Start All
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={stopAllActive}
              disabled={activeSessionByCamera.size === 0}
            >
              Stop All
            </Button>
            <p className="text-xs text-muted-foreground">
              {selectedCameras.length} camera(s) in grid, {activeSessionByCamera.size} active session(s)
            </p>
          </div>
        </CardContent>
      </Card>

      {!sessionsLoading && selectedCameras.length > 0 && activeSessionByCamera.size > 0 ? (
        <Alert variant="success">
          <AlertTitle>Live sessions active</AlertTitle>
          <AlertDescription>
            {activeSessionByCamera.size} stream session(s) currently running across selected sites.
          </AlertDescription>
        </Alert>
      ) : null}

      {selectedCameras.length === 0 ? (
        <StatusState
          variant="empty"
          title="No cameras in the live grid"
          description="Add at least one camera from the selector above to begin live monitoring."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {selectedCameras.map((camera) => {
            const activeSession = activeSessionByCamera.get(camera.id);
            const streamProfile = streamProfiles[camera.id] || "sub";
            const isStarting = startingCameraId === camera.id;
            const isStopping = activeSession ? stoppingSessionId === activeSession.id : false;
            const isSwitching = activeSession ? switchingSessionId === activeSession.id : false;

            return (
              <Card key={camera.id}>
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <CardTitle className="text-base">{camera.name}</CardTitle>
                      <CardDescription>
                        {camera.site?.name || "Unknown Site"} | {camera.area}
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={camera.isOnline ? "outline" : "destructive"}>
                        {camera.isOnline ? (
                          <CheckCircle className="mr-1 h-3 w-3" />
                        ) : (
                          <XCircle className="mr-1 h-3 w-3" />
                        )}
                        {camera.isOnline ? "Online" : "Offline"}
                      </Badge>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        onClick={() => removeCameraFromGrid(camera.id)}
                        aria-label={`Remove ${camera.name} from grid`}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Stream Profile</label>
                    <Select
                      value={streamProfile}
                      onValueChange={(value) =>
                        onProfileChange(camera.id, value as "main" | "sub" | "third")
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="sub">Sub stream (grid)</SelectItem>
                        <SelectItem value="main">Main stream (full quality)</SelectItem>
                        <SelectItem value="third">Third stream</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {activeSession ? (
                    <div className="rounded-md border bg-muted/40 p-3 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">Session Active</span>
                        <Badge variant="secondary">{activeSession.protocol}</Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Started {new Date(activeSession.startedAt).toLocaleString()}
                      </p>
                      {activeSession.playUrl ? (
                        <p className="mt-2 text-xs">
                          <a
                            href={activeSession.playUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-primary underline"
                          >
                            Open stream endpoint
                          </a>
                        </p>
                      ) : (
                        <p className="mt-2 text-xs text-muted-foreground">
                          Stream endpoint unavailable. Check gateway configuration.
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                      No active session. Start live view to begin monitoring this camera.
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    {activeSession ? (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => stopSessionMutation.mutate(activeSession.id)}
                        disabled={isStopping}
                      >
                        {isStopping ? "Stopping..." : "Stop Live"}
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        onClick={() =>
                          startSessionMutation.mutate({
                            cameraId: camera.id,
                            streamType: streamProfile,
                          })
                        }
                        disabled={!camera.isOnline || isStarting}
                      >
                        <Video className="mr-2 h-4 w-4" />
                        {isStarting ? "Starting..." : "Start Live"}
                      </Button>
                    )}
                    {isSwitching ? <span className="text-xs text-muted-foreground">Switching profile...</span> : null}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
