"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  CCTVStreamSession,
  Camera,
  Site,
  StartStreamSessionResponse,
  StreamProfileResponse,
  fetchCCTVStreamSessions,
  startCCTVStreamSession,
  stopCCTVStreamSession,
  switchCCTVStreamProfile,
} from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api-client";
import {
  Building2,
  ChevronDown,
  Fullscreen,
  FullscreenExit,
  Grid3x3,
  History,
  Play,
  Square,
  Video,
  Volume2,
  VolumeOff,
} from "@/lib/icons";
import { StatusState } from "@/components/shared/status-state";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";

type LiveMonitorViewProps = {
  sites: Site[];
  cameras: Camera[];
};

type GridDensity = 4 | 6 | 9 | 12;
type StreamType = "main" | "sub" | "third";
type StreamProtocol = "WEBRTC" | "HLS";

type StreamHint = {
  playUrl: string | null;
  fallbackPlayUrl: string | null;
  protocol: StreamProtocol;
};

const layoutOptions: Array<{
  value: GridDensity;
  label: string;
}> = [
  { value: 4, label: "2 x 2 wall" },
  { value: 6, label: "3 x 2 wall" },
  { value: 9, label: "3 x 3 wall" },
  { value: 12, label: "4 x 3 wall" },
];

const streamProfileOptions: Array<{
  value: StreamType;
  label: string;
}> = [
  { value: "sub", label: "720p" },
  { value: "main", label: "1080p" },
];

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

function getGridClass(density: GridDensity) {
  switch (density) {
    case 4:
      return "md:grid-cols-2";
    case 6:
      return "md:grid-cols-2 xl:grid-cols-3";
    case 9:
      return "md:grid-cols-2 xl:grid-cols-3";
    case 12:
      return "md:grid-cols-2 xl:grid-cols-4";
    default:
      return "md:grid-cols-2";
  }
}

function isLikelyWhepUrl(url: string) {
  return /\/whep(\/|$|\?)/i.test(url);
}

function waitForIceGatheringComplete(peerConnection: RTCPeerConnection) {
  if (peerConnection.iceGatheringState === "complete") {
    return Promise.resolve();
  }

  return new Promise<void>((resolve) => {
    const timeout = window.setTimeout(() => {
      peerConnection.removeEventListener("icegatheringstatechange", handler);
      resolve();
    }, 1500);

    const handler = () => {
      if (peerConnection.iceGatheringState === "complete") {
        window.clearTimeout(timeout);
        peerConnection.removeEventListener("icegatheringstatechange", handler);
        resolve();
      }
    };

    peerConnection.addEventListener("icegatheringstatechange", handler);
  });
}

type CCTVTileStreamProps = {
  primaryUrl: string;
  fallbackUrl: string | null;
  protocol: StreamProtocol;
  muted: boolean;
};

function CCTVTileStream({
  primaryUrl,
  fallbackUrl,
  protocol,
  muted,
}: CCTVTileStreamProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mutedRef = useRef(muted);
  const [isUsingFallback, setIsUsingFallback] = useState(false);
  const [renderState, setRenderState] = useState<"connecting" | "playing" | "error">(
    "connecting",
  );
  const [hasVideoFrame, setHasVideoFrame] = useState(false);
  const hasVideoFrameRef = useRef(false);

  const streamUrl = isUsingFallback && fallbackUrl ? fallbackUrl : primaryUrl;

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !streamUrl) return;

    let isCancelled = false;
    let cleanup: (() => void) | undefined;
    hasVideoFrameRef.current = false;

    const attachDirectVideo = async () => {
      video.srcObject = null;
      video.src = streamUrl;
      video.muted = mutedRef.current;
      video.autoplay = true;
      video.playsInline = true;

      const markPlaying = () => {
        if (isCancelled) return;
        if (!hasVideoFrameRef.current) {
          hasVideoFrameRef.current = true;
          setHasVideoFrame(true);
        }
        setRenderState("playing");
      };

      const onPlaying = () => {
        markPlaying();
      };
      const onError = () => {
        if (isCancelled || hasVideoFrameRef.current) return;
        if (
          video.currentTime > 0 ||
          video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
        ) {
          markPlaying();
          return;
        }
        setRenderState("error");
      };
      const onTimeUpdate = () => {
        markPlaying();
      };

      video.addEventListener("playing", onPlaying);
      video.addEventListener("error", onError);
      video.addEventListener("timeupdate", onTimeUpdate);

      try {
        await video.play();
        markPlaying();
      } catch {
        // Browser may block autoplay with audio. Keep state as connecting.
      }

      cleanup = () => {
        video.removeEventListener("playing", onPlaying);
        video.removeEventListener("error", onError);
        video.removeEventListener("timeupdate", onTimeUpdate);
        video.pause();
        video.removeAttribute("src");
        video.load();
      };
    };

    const attachWhepStream = async () => {
      const peerConnection = new RTCPeerConnection();
      let sessionResourceUrl: string | null = null;

      peerConnection.addTransceiver("video", { direction: "recvonly" });
      peerConnection.addTransceiver("audio", { direction: "recvonly" });

      peerConnection.ontrack = (event) => {
        const [remoteStream] = event.streams;
        if (remoteStream) {
          video.srcObject = remoteStream;
        } else {
          const stream = new MediaStream([event.track]);
          video.srcObject = stream;
        }
        video.muted = mutedRef.current;
        void video.play().catch(() => undefined);
        if (!isCancelled) {
          if (!hasVideoFrameRef.current) {
            hasVideoFrameRef.current = true;
            setHasVideoFrame(true);
          }
          setRenderState("playing");
        }
      };

      peerConnection.oniceconnectionstatechange = () => {
        if (isCancelled) return;
        const state = peerConnection.iceConnectionState;
        if ((state === "failed" || state === "closed") && !hasVideoFrameRef.current) {
          setRenderState("error");
        }
      };

      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
      await waitForIceGatheringComplete(peerConnection);

      const localSdp = peerConnection.localDescription?.sdp;
      if (!localSdp) {
        throw new Error("Unable to initialize WebRTC offer.");
      }

      const response = await fetch(streamUrl, {
        method: "POST",
        headers: { "Content-Type": "application/sdp" },
        body: localSdp,
      });

      if (!response.ok) {
        throw new Error(`Stream signaling failed (${response.status}).`);
      }

      const answerSdp = await response.text();
      await peerConnection.setRemoteDescription({
        type: "answer",
        sdp: answerSdp,
      });

      const locationHeader = response.headers.get("location");
      if (locationHeader) {
        sessionResourceUrl = new URL(locationHeader, streamUrl).toString();
      }

      cleanup = () => {
        peerConnection.close();
        if (sessionResourceUrl) {
          void fetch(sessionResourceUrl, { method: "DELETE" }).catch(
            () => undefined,
          );
        }
      };
    };

    const setup = async () => {
      try {
        setRenderState("connecting");
        if (isLikelyWhepUrl(streamUrl)) {
          await attachWhepStream();
        } else {
          await attachDirectVideo();
        }
      } catch {
        if (!isCancelled && fallbackUrl && !isUsingFallback) {
          setIsUsingFallback(true);
          return;
        }
        if (!isCancelled && !hasVideoFrameRef.current) {
          setRenderState("error");
        }
      }
    };

    void setup();

    return () => {
      isCancelled = true;
      if (cleanup) cleanup();
    };
  }, [fallbackUrl, isUsingFallback, protocol, streamUrl]);

  useEffect(() => {
    mutedRef.current = muted;
    const video = videoRef.current;
    if (!video) return;
    video.muted = muted;
  }, [muted]);

  return (
    <div className="absolute inset-0 overflow-hidden bg-black">
      <video
        ref={videoRef}
        className="h-full w-full object-cover"
        autoPlay
        playsInline
        muted={muted}
      />
      {renderState !== "playing" && !hasVideoFrame ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/45 text-xs text-white/75">
          {renderState === "error" ? "Stream unavailable" : "Connecting..."}
        </div>
      ) : null}
    </div>
  );
}

export function LiveMonitorView({ sites, cameras }: LiveMonitorViewProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const wallRef = useRef<HTMLDivElement | null>(null);
  const autoStartLocksRef = useRef<Set<string>>(new Set());

  const [selectedSiteId, setSelectedSiteId] = useState<string>("");
  const [layoutDensity, setLayoutDensity] = useState<GridDensity>(9);
  const [wallStreamType, setWallStreamType] = useState<StreamType>("sub");
  const [audibleCameraId, setAudibleCameraId] = useState<string | null>(null);
  const [focusedCameraId, setFocusedCameraId] = useState<string>("");
  const [maximizedCameraId, setMaximizedCameraId] = useState<string | null>(null);
  const [isWallFullscreen, setIsWallFullscreen] = useState(false);
  const [startingCameraIds, setStartingCameraIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [stoppingSessionIds, setStoppingSessionIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [switchingSessionIds, setSwitchingSessionIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [streamHintsByCamera, setStreamHintsByCamera] = useState<
    Record<string, StreamHint>
  >({});

  const { data: sessionsData, error: sessionsError } = useQuery({
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
        selectedSiteId ? camera.siteId === selectedSiteId : true,
      )
      .sort((a, b) => {
        const siteNameA = a.site?.name || "";
        const siteNameB = b.site?.name || "";
        if (siteNameA !== siteNameB) return siteNameA.localeCompare(siteNameB);
        if (a.area !== b.area) return a.area.localeCompare(b.area);
        return a.name.localeCompare(b.name);
      });
  }, [cameras, selectedSiteId]);

  const maximizedCamera = useMemo(
    () =>
      maximizedCameraId
        ? filteredCameras.find((camera) => camera.id === maximizedCameraId) || null
        : null,
    [filteredCameras, maximizedCameraId],
  );

  const wallSlots = useMemo(() => {
    if (maximizedCamera) {
      return [maximizedCamera];
    }
    return Array.from(
      { length: layoutDensity },
      (_, index) => filteredCameras[index] ?? null,
    );
  }, [filteredCameras, layoutDensity, maximizedCamera]);

  const visibleWallCameras = useMemo(
    () => wallSlots.filter((camera): camera is Camera => Boolean(camera)),
    [wallSlots],
  );

  const focusedCamera = useMemo(() => {
    if (focusedCameraId) {
      return visibleWallCameras.find((camera) => camera.id === focusedCameraId);
    }
    return visibleWallCameras[0];
  }, [focusedCameraId, visibleWallCameras]);

  const isWallMaximizedToSingleCamera = Boolean(maximizedCamera);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsWallFullscreen(document.fullscreenElement === wallRef.current);
    };

    handleFullscreenChange();
    document.addEventListener("fullscreenchange", handleFullscreenChange);

    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);

  const startSessionMutation = useMutation({
    mutationFn: (input: { cameraId: string; streamType: StreamType }) =>
      startCCTVStreamSession({
        cameraId: input.cameraId,
        streamType: input.streamType,
        preferredProtocol: "WEBRTC",
        purpose: "Live monitor",
      }),
    onMutate: (input) => {
      setStartingCameraIds((prev) => new Set(prev).add(input.cameraId));
    },
    onSuccess: (
      response: StartStreamSessionResponse,
      input: { cameraId: string; streamType: StreamType },
    ) => {
      setStreamHintsByCamera((prev) => ({
        ...prev,
        [input.cameraId]: {
          playUrl: response.playUrl,
          fallbackPlayUrl: response.fallbackPlayUrl,
          protocol: response.protocol,
        },
      }));
      queryClient.invalidateQueries({ queryKey: ["cctv-stream-sessions"] });
    },
    onError: (error, input) => {
      autoStartLocksRef.current.delete(input.cameraId);
      toast({
        title: "Unable to start stream",
        description: getApiErrorMessage(error),
        variant: "destructive",
      });
    },
    onSettled: (_, __, input) => {
      setStartingCameraIds((prev) => {
        const next = new Set(prev);
        next.delete(input.cameraId);
        return next;
      });
    },
  });

  const stopSessionMutation = useMutation({
    mutationFn: (sessionId: string) => stopCCTVStreamSession(sessionId),
    onMutate: (sessionId) => {
      setStoppingSessionIds((prev) => new Set(prev).add(sessionId));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cctv-stream-sessions"] });
    },
    onError: (error) => {
      toast({
        title: "Unable to stop stream",
        description: getApiErrorMessage(error),
        variant: "destructive",
      });
    },
    onSettled: (_, __, sessionId) => {
      setStoppingSessionIds((prev) => {
        const next = new Set(prev);
        next.delete(sessionId);
        return next;
      });
    },
  });

  const switchProfileMutation = useMutation({
    mutationFn: (input: {
      cameraId: string;
      sessionId: string;
      streamType: StreamType;
    }) =>
      switchCCTVStreamProfile({
        sessionId: input.sessionId,
        streamType: input.streamType,
        preferredProtocol: "WEBRTC",
      }),
    onMutate: (input) => {
      setSwitchingSessionIds((prev) => new Set(prev).add(input.sessionId));
    },
    onSuccess: (
      response: StreamProfileResponse,
      input: { cameraId: string; sessionId: string; streamType: StreamType },
    ) => {
      setStreamHintsByCamera((prev) => ({
        ...prev,
        [input.cameraId]: {
          playUrl: response.playUrl,
          fallbackPlayUrl: response.fallbackPlayUrl,
          protocol: response.protocol,
        },
      }));
      queryClient.invalidateQueries({ queryKey: ["cctv-stream-sessions"] });
    },
    onError: (error) => {
      toast({
        title: "Unable to change stream profile",
        description: getApiErrorMessage(error),
        variant: "destructive",
      });
    },
    onSettled: (_, __, input) => {
      setSwitchingSessionIds((prev) => {
        const next = new Set(prev);
        next.delete(input.sessionId);
        return next;
      });
    },
  });

  useEffect(() => {
    const visibleIds = new Set(visibleWallCameras.map((camera) => camera.id));
    autoStartLocksRef.current.forEach((cameraId) => {
      if (!visibleIds.has(cameraId)) {
        autoStartLocksRef.current.delete(cameraId);
      }
    });
  }, [visibleWallCameras]);

  useEffect(() => {
    visibleWallCameras.forEach((camera) => {
      if (!camera.isOnline) return;
      if (autoStartLocksRef.current.has(camera.id)) return;
      const hasStreamHint = Boolean(
        streamHintsByCamera[camera.id]?.playUrl ||
          streamHintsByCamera[camera.id]?.fallbackPlayUrl,
      );
      if (activeSessionByCamera.has(camera.id) && hasStreamHint) return;

      autoStartLocksRef.current.add(camera.id);
      startSessionMutation.mutate({
        cameraId: camera.id,
        streamType: wallStreamType,
      });
    });
  }, [
    activeSessionByCamera,
    startSessionMutation,
    streamHintsByCamera,
    visibleWallCameras,
    wallStreamType,
  ]);

  const activeSessionsCount = visibleWallCameras.filter((camera) =>
    activeSessionByCamera.has(camera.id),
  ).length;

  const selectedSiteName =
    sites.find((site) => site.id === selectedSiteId)?.name || "All sites";

  const startAllVisible = () => {
    visibleWallCameras.forEach((camera) => {
      if (activeSessionByCamera.has(camera.id) || !camera.isOnline) return;
      autoStartLocksRef.current.add(camera.id);
      startSessionMutation.mutate({
        cameraId: camera.id,
        streamType: wallStreamType,
      });
    });
  };

  const stopAllVisible = () => {
    visibleWallCameras.forEach((camera) => {
      const session = activeSessionByCamera.get(camera.id);
      if (session) {
        stopSessionMutation.mutate(session.id);
      }
    });
    setAudibleCameraId(null);
  };

  const applyResolutionVisible = (nextStreamType: StreamType) => {
    visibleWallCameras.forEach((camera) => {
      const session = activeSessionByCamera.get(camera.id);
      if (!session || session.streamType === nextStreamType) return;
      switchProfileMutation.mutate({
        cameraId: camera.id,
        sessionId: session.id,
        streamType: nextStreamType,
      });
    });
  };

  const handleResolutionSelection = (nextStreamType: StreamType) => {
    setWallStreamType(nextStreamType);
    applyResolutionVisible(nextStreamType);
  };

  const toggleFullscreen = async () => {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }

    if (wallRef.current?.requestFullscreen) {
      await wallRef.current.requestFullscreen();
    }
  };

  const toggleCameraMaximized = (cameraId: string) => {
    setFocusedCameraId(cameraId);
    setMaximizedCameraId((previousCameraId) =>
      previousCameraId === cameraId ? null : cameraId,
    );
  };

  const toggleTileAudio = (cameraId: string) => {
    setAudibleCameraId((previousCameraId) =>
      previousCameraId === cameraId ? null : cameraId,
    );
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
    <div className="h-[calc(100vh-7rem)]">
      <div
        ref={wallRef}
        className="relative h-full overflow-hidden border border-black/10 bg-black"
      >
        <div
          className={cn(
            "grid h-[calc(100%-3rem)] grid-cols-1 gap-px bg-black",
            isWallMaximizedToSingleCamera ? "grid-cols-1" : getGridClass(layoutDensity),
          )}
        >
          {wallSlots.map((camera, index) => {
            if (!camera) {
              return (
                <div
                  key={`slot-${index}`}
                  className="relative min-h-[220px] bg-black"
                />
              );
            }

            const activeSession = activeSessionByCamera.get(camera.id);
            const streamHint = streamHintsByCamera[camera.id];
            const streamUrl = streamHint?.playUrl || activeSession?.playUrl || null;
            const fallbackUrl = streamHint?.fallbackPlayUrl || null;
            const protocol = (streamHint?.protocol ||
              (activeSession?.protocol as StreamProtocol | undefined) ||
              "WEBRTC") as StreamProtocol;

            const isFocused = focusedCamera?.id === camera.id;
            const isStarting = startingCameraIds.has(camera.id);
            const isStopping = activeSession
              ? stoppingSessionIds.has(activeSession.id)
              : false;
            const isSwitching = activeSession
              ? switchingSessionIds.has(activeSession.id)
              : false;
            const isAudible = audibleCameraId === camera.id;
            const isMaximized = maximizedCamera?.id === camera.id;

            const statusLabel = !camera.isOnline
              ? "Offline"
              : activeSession
                ? isSwitching
                  ? "Switching"
                  : "Live"
                : isStarting
                  ? "Starting"
                  : "Ready";

            return (
              <div
                key={camera.id}
                className={cn(
                  "group relative min-h-[220px] overflow-hidden bg-black text-white",
                  isFocused && "ring-1 ring-white/30",
                )}
              >
                {activeSession && streamUrl ? (
                  <CCTVTileStream
                    key={`${activeSession.id}:${streamUrl}:${fallbackUrl || ""}:${protocol}`}
                    primaryUrl={streamUrl}
                    fallbackUrl={fallbackUrl}
                    protocol={protocol}
                    muted={!isAudible}
                  />
                ) : (
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),transparent_35%),linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0)_42%)]" />
                )}

                <button
                  type="button"
                  className="absolute inset-0 z-10"
                  onClick={() => setFocusedCameraId(camera.id)}
                  aria-label={`Focus ${camera.name}`}
                />

                <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center justify-between gap-3 px-3 py-2 text-[11px] font-medium text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.65)]">
                  <span className="truncate tabular-nums">
                    {new Date().toLocaleString()}
                  </span>
                  <span
                    className={cn(
                      "shrink-0 rounded-full border px-2 py-0.5 text-[10px]",
                      !camera.isOnline
                        ? "border-rose-400/35 bg-rose-500/10 text-rose-100"
                        : activeSession
                          ? "border-emerald-400/35 bg-emerald-500/10 text-emerald-100"
                          : "border-white/20 bg-white/10 text-white/80",
                    )}
                  >
                    {statusLabel}
                  </span>
                </div>

                <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex items-end justify-between gap-3 bg-gradient-to-t from-black via-black/72 to-transparent px-3 pb-3 pt-10">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-white">
                      {camera.name}
                    </div>
                    <div className="truncate text-xs text-white/68">
                      {camera.area} | {camera.site?.name || "Unknown site"}
                    </div>
                  </div>

                  <div className="pointer-events-auto flex shrink-0 items-center gap-2 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100">
                    {activeSession ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 rounded-md bg-rose-500/20 text-rose-100 hover:bg-rose-500/32"
                        onClick={() => {
                          if (isAudible) setAudibleCameraId(null);
                          stopSessionMutation.mutate(activeSession.id);
                        }}
                        disabled={isStopping}
                        aria-label={`Stop ${camera.name}`}
                        title="Stop stream"
                      >
                        <Square className="h-4 w-4" />
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        size="icon"
                        className="h-8 w-8 rounded-md bg-emerald-500/24 text-emerald-100 hover:bg-emerald-500/34"
                        onClick={() =>
                          startSessionMutation.mutate({
                            cameraId: camera.id,
                            streamType: wallStreamType,
                          })
                        }
                        disabled={!camera.isOnline || isStarting}
                        aria-label={`Start ${camera.name}`}
                        title="Start stream"
                      >
                        <Play className="h-4 w-4" />
                      </Button>
                    )}

                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className={cn(
                        "h-8 w-8 rounded-md bg-white/12 text-white hover:bg-white/18",
                        isAudible && "bg-emerald-500/24 text-emerald-100 hover:bg-emerald-500/34",
                      )}
                      onClick={() => toggleTileAudio(camera.id)}
                      disabled={!activeSession}
                      aria-label={
                        isAudible ? `Mute ${camera.name}` : `Unmute ${camera.name}`
                      }
                      title={isAudible ? "Mute tile" : "Unmute tile"}
                    >
                      {isAudible ? (
                        <Volume2 className="h-4 w-4" />
                      ) : (
                        <VolumeOff className="h-4 w-4" />
                      )}
                    </Button>

                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 rounded-md bg-white/12 text-white hover:bg-white/18"
                      onClick={() => toggleCameraMaximized(camera.id)}
                      aria-label={
                        isMaximized
                          ? `Return ${camera.name} to grid`
                          : `Maximize ${camera.name}`
                      }
                      title={isMaximized ? "Back to grid" : "Maximize tile"}
                    >
                      {isMaximized ? (
                        <FullscreenExit className="h-4 w-4" />
                      ) : (
                        <Fullscreen className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <div className="absolute inset-x-0 bottom-0 z-30 h-12 border-t border-white/10 bg-[rgba(12,12,12,0.96)] px-2">
          <div className="flex h-full min-w-max items-center gap-2 overflow-x-auto text-white">
            <div className="flex items-center gap-2 pr-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    className="h-8 rounded-md bg-white/8 px-2.5 text-white hover:bg-white/14"
                  >
                    <Building2 className="h-4 w-4" />
                    <span className="ml-1.5 max-w-32 truncate text-xs">
                      {selectedSiteName}
                    </span>
                    <ChevronDown className="ml-1 h-4 w-4 text-white/65" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="center" className="w-60">
                  <DropdownMenuLabel>Site selector</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuRadioGroup
                    value={selectedSiteId || "__all__"}
                    onValueChange={(value) =>
                      setSelectedSiteId(value === "__all__" ? "" : value)
                    }
                  >
                    <DropdownMenuRadioItem value="__all__">
                      All sites
                    </DropdownMenuRadioItem>
                    {sites.map((site) => (
                      <DropdownMenuRadioItem key={site.id} value={site.id}>
                        {site.name}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    className="h-8 rounded-md bg-white/8 px-2.5 text-white hover:bg-white/14"
                  >
                    <Grid3x3 className="h-4 w-4" />
                    <span className="ml-1.5 text-xs">
                      {layoutOptions.find((option) => option.value === layoutDensity)
                        ?.label || "Layout"}
                    </span>
                    <ChevronDown className="ml-1 h-4 w-4 text-white/65" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="center" className="w-52">
                  <DropdownMenuLabel>Grid layout</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuRadioGroup
                    value={String(layoutDensity)}
                    onValueChange={(value) =>
                      setLayoutDensity(Number(value) as GridDensity)
                    }
                  >
                    {layoutOptions.map((option) => (
                      <DropdownMenuRadioItem
                        key={option.value}
                        value={String(option.value)}
                      >
                        {option.label}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    className="h-8 rounded-md bg-white/8 px-2.5 text-white hover:bg-white/14"
                  >
                    <Video className="h-4 w-4" />
                    <span className="ml-1.5 text-xs">
                      {streamProfileOptions.find(
                        (option) => option.value === wallStreamType,
                      )?.label}
                    </span>
                    <ChevronDown className="ml-1 h-4 w-4 text-white/65" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="center" className="w-56">
                  <DropdownMenuLabel>Stream profile</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuRadioGroup
                    value={wallStreamType}
                    onValueChange={(value) =>
                      handleResolutionSelection(value as StreamType)
                    }
                  >
                    {streamProfileOptions.map((option) => (
                      <DropdownMenuRadioItem key={option.value} value={option.value}>
                        {option.label}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {activeSessionsCount > 0 ? (
              <Button
                type="button"
                variant="ghost"
                className="h-8 rounded-md bg-rose-500/24 px-2.5 text-rose-100 hover:bg-rose-500/34"
                onClick={stopAllVisible}
                disabled={activeSessionsCount === 0}
              >
                <Square className="mr-1.5 h-4 w-4" />
                <span className="text-xs">Stop</span>
              </Button>
            ) : (
              <Button
                type="button"
                variant="ghost"
                className="h-8 rounded-md bg-emerald-500/24 px-2.5 text-emerald-100 hover:bg-emerald-500/34"
                onClick={startAllVisible}
                disabled={visibleWallCameras.length === 0}
              >
                <Play className="mr-1.5 h-4 w-4" />
                <span className="text-xs">Play</span>
              </Button>
            )}

            {isWallMaximizedToSingleCamera ? (
              <Button
                type="button"
                variant="ghost"
                className="h-8 rounded-md bg-white/8 px-2.5 text-white hover:bg-white/14"
                onClick={() => setMaximizedCameraId(null)}
              >
                <Grid3x3 className="mr-1.5 h-4 w-4" />
                <span className="text-xs">Grid</span>
              </Button>
            ) : null}

            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-md bg-white/8 text-white hover:bg-white/14"
              onClick={() => void toggleFullscreen()}
              aria-label="Toggle full screen"
              title="Full screen"
            >
              {isWallFullscreen ? (
                <FullscreenExit className="h-4 w-4" />
              ) : (
                <Fullscreen className="h-4 w-4" />
              )}
            </Button>

            <Button
              asChild
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-md bg-white/8 text-white hover:bg-white/14"
              aria-label="Open playback"
              title="Playback"
            >
              <Link href="/cctv/playback">
                <History className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
