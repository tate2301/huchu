"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Hls from "hls.js";

import {
  CCTVStreamSession,
  Camera,
  Pagination,
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
  ArrowRight,
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
import { Badge } from "@/components/ui/badge";
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
import { StatusDot } from "@/components/ui/status-dot";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";

type LiveMonitorViewProps = {
  sites: Site[];
  cameras: Camera[];
};

type GridDensity = 4 | 6 | 9 | 12;
type StreamType = "main" | "sub" | "third";
type StreamProtocol = "WEBRTC" | "HLS";
type DeviceViewport = "phone" | "tablet" | "desktop";

type StreamHint = {
  playUrl: string | null;
  fallbackPlayUrl: string | null;
  snapshotUrl: string | null;
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

function getCameraStatusState({
  isOnline,
  isActive,
  isSwitching,
  isStarting,
}: {
  isOnline: boolean;
  isActive: boolean;
  isSwitching: boolean;
  isStarting: boolean;
}) {
  if (!isOnline) {
    return {
      label: "Offline",
      badgeVariant: "danger" as const,
      dotStatus: "failing" as const,
    };
  }

  if (isActive) {
    if (isSwitching) {
      return {
        label: "Switching",
        badgeVariant: "info" as const,
        dotStatus: "in_review" as const,
      };
    }

    return {
      label: "Live",
      badgeVariant: "success" as const,
      dotStatus: "passing" as const,
    };
  }

  if (isStarting) {
    return {
      label: "Starting",
      badgeVariant: "info" as const,
      dotStatus: "in_progress" as const,
    };
  }

  return {
    label: "Ready",
    badgeVariant: "neutral" as const,
    dotStatus: "pending" as const,
  };
}

function buildSessionMap(sessions: CCTVStreamSession[] | undefined) {
  const map = new Map<string, CCTVStreamSession>();
  if (!sessions) return map;
  sessions
    .filter((session) => session.status === "ACTIVE")
    .forEach((session) => {
      if (!map.has(session.cameraId)) {
        map.set(session.cameraId, session);
      }
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

function isLikelyHlsUrl(url: string) {
  return /\.m3u8($|\?)/i.test(url);
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
  snapshotUrl: string | null;
  protocol: StreamProtocol;
  muted: boolean;
};

function CCTVTileStream({
  primaryUrl,
  fallbackUrl,
  snapshotUrl,
  protocol,
  muted,
}: CCTVTileStreamProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mutedRef = useRef(muted);
  const reconnectAttemptsRef = useRef(0);
  const lastProgressAtRef = useRef(0);
  const stallTimerRef = useRef<number | null>(null);
  const [isUsingFallback, setIsUsingFallback] = useState(false);
  const [isUsingSnapshotFallback, setIsUsingSnapshotFallback] = useState(false);
  const [reconnectToken, setReconnectToken] = useState(0);
  const [snapshotRefreshTick, setSnapshotRefreshTick] = useState(0);
  const [renderState, setRenderState] = useState<"connecting" | "playing" | "error">(
    "connecting",
  );
  const [hasVideoFrame, setHasVideoFrame] = useState(false);
  const hasVideoFrameRef = useRef(false);

  const streamUrl = isUsingFallback && fallbackUrl ? fallbackUrl : primaryUrl;
  const snapshotAssetUrl = snapshotUrl
    ? `${snapshotUrl}${snapshotUrl.includes("?") ? "&" : "?"}_t=${snapshotRefreshTick}`
    : null;

  useEffect(() => {
    if (!isUsingSnapshotFallback) return;
    const interval = window.setInterval(() => {
      setSnapshotRefreshTick((tick) => tick + 1);
    }, 4000);

    return () => window.clearInterval(interval);
  }, [isUsingSnapshotFallback]);

  useEffect(() => {
    const video = videoRef.current;
    if (isUsingSnapshotFallback || !video || !streamUrl) return;

    let isCancelled = false;
    let cleanup: (() => void) | undefined;
    hasVideoFrameRef.current = false;
    lastProgressAtRef.current = 0;

    const clearStallTimer = () => {
      if (stallTimerRef.current) {
        window.clearTimeout(stallTimerRef.current);
        stallTimerRef.current = null;
      }
    };

    const promoteFallback = () => {
      if (!isCancelled && fallbackUrl && !isUsingFallback) {
        setIsUsingFallback(true);
        return true;
      }
      if (!isCancelled && snapshotUrl && !isUsingSnapshotFallback) {
        setIsUsingSnapshotFallback(true);
        return true;
      }
      return false;
    };

    const retryStream = () => {
      if (isCancelled) return false;
      clearStallTimer();
      if (reconnectAttemptsRef.current < 2) {
        reconnectAttemptsRef.current += 1;
        setRenderState("connecting");
        setReconnectToken((current) => current + 1);
        return true;
      }
      reconnectAttemptsRef.current = 0;
      return promoteFallback();
    };

    const attachDirectVideo = async () => {
      let hls: Hls | null = null;

      video.srcObject = null;
      video.muted = mutedRef.current;
      video.autoplay = true;
      video.playsInline = true;
      video.preload = "auto";
      video.setAttribute("playsinline", "true");
      video.setAttribute("webkit-playsinline", "true");

      const markPlaying = () => {
        if (isCancelled) return;
        if (!hasVideoFrameRef.current) {
          hasVideoFrameRef.current = true;
          setHasVideoFrame(true);
        }
        reconnectAttemptsRef.current = 0;
        lastProgressAtRef.current = video.currentTime;
        clearStallTimer();
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
        if (!promoteFallback()) {
          setRenderState("error");
        }
      };
      const onTimeUpdate = () => {
        lastProgressAtRef.current = video.currentTime;
        markPlaying();
      };
      const onLoadedData = () => {
        markPlaying();
      };
      const onCanPlay = () => {
        markPlaying();
      };
      const onStalled = () => {
        if (isCancelled || !hasVideoFrameRef.current) return;
        clearStallTimer();
        stallTimerRef.current = window.setTimeout(() => {
          if (isCancelled) return;
          const hasProgress =
            video.currentTime > lastProgressAtRef.current ||
            video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA;
          if (hasProgress) {
            lastProgressAtRef.current = video.currentTime;
            return;
          }
          if (!retryStream()) {
            setRenderState("error");
          }
        }, 3500);
      };

      video.addEventListener("playing", onPlaying);
      video.addEventListener("error", onError);
      video.addEventListener("timeupdate", onTimeUpdate);
      video.addEventListener("loadeddata", onLoadedData);
      video.addEventListener("canplay", onCanPlay);
      video.addEventListener("waiting", onStalled);
      video.addEventListener("stalled", onStalled);
      video.addEventListener("suspend", onStalled);

      if (isLikelyHlsUrl(streamUrl) && Hls.isSupported()) {
        hls = new Hls({
          enableWorker: true,
          lowLatencyMode: true,
        });
        hls.loadSource(streamUrl);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          void video.play().catch(() => undefined);
        });
        hls.on(Hls.Events.ERROR, (_, data) => {
          if (isCancelled) return;
          if (data.fatal) {
            if (!retryStream()) {
              setRenderState("error");
            }
          }
        });
      } else {
        video.src = streamUrl;
      }

      const watchdog = window.setTimeout(() => {
        if (isCancelled || hasVideoFrameRef.current) return;
        if (!promoteFallback()) {
          setRenderState("error");
        }
      }, 7000);

      try {
        await video.play();
        markPlaying();
      } catch {
        // Browser may block autoplay with audio. Keep state as connecting.
      }

      cleanup = () => {
        window.clearTimeout(watchdog);
        clearStallTimer();
        video.removeEventListener("playing", onPlaying);
        video.removeEventListener("error", onError);
        video.removeEventListener("timeupdate", onTimeUpdate);
        video.removeEventListener("loadeddata", onLoadedData);
        video.removeEventListener("canplay", onCanPlay);
        video.removeEventListener("waiting", onStalled);
        video.removeEventListener("stalled", onStalled);
        video.removeEventListener("suspend", onStalled);
        hls?.destroy();
        video.pause();
        video.srcObject = null;
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
        if (
          state === "disconnected" ||
          state === "failed" ||
          state === "closed"
        ) {
          if (!retryStream()) {
            setRenderState("error");
          }
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
        if (!promoteFallback() && !isCancelled && !hasVideoFrameRef.current) {
          setRenderState("error");
        }
      }
    };

    void setup();

    return () => {
      isCancelled = true;
      clearStallTimer();
      if (cleanup) cleanup();
    };
  }, [
    fallbackUrl,
    isUsingFallback,
    isUsingSnapshotFallback,
    protocol,
    reconnectToken,
    snapshotUrl,
    streamUrl,
  ]);

  useEffect(() => {
    mutedRef.current = muted;
    const video = videoRef.current;
    if (!video) return;
    video.muted = muted;
  }, [muted]);

  return (
    <div className="absolute inset-0 overflow-hidden bg-black">
      {isUsingSnapshotFallback && snapshotAssetUrl ? (
        // Snapshot fallback is an unoptimized authenticated gateway image stream.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={snapshotAssetUrl}
          alt=""
          className="h-full w-full object-cover"
          draggable={false}
        />
      ) : (
        <video
          ref={videoRef}
          className="h-full w-full object-cover"
          autoPlay
          playsInline
          muted={muted}
        />
      )}
      {renderState !== "playing" && !hasVideoFrame ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/45 text-xs text-white/75">
          {isUsingSnapshotFallback
            ? "Snapshot mode"
            : renderState === "error"
              ? "Stream unavailable"
              : "Connecting..."}
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
  const [preferredProtocol, setPreferredProtocol] = useState<StreamProtocol | null>(null);
  const [deviceViewport, setDeviceViewport] = useState<DeviceViewport>("desktop");
  const [webrtcSupported, setWebrtcSupported] = useState(false);

  const [selectedSiteId, setSelectedSiteId] = useState<string>("");
  const [layoutDensity, setLayoutDensity] = useState<GridDensity>(9);
  const [wallStreamType, setWallStreamType] = useState<StreamType>("sub");
  const [audibleCameraId, setAudibleCameraId] = useState<string | null>(null);
  const [focusedCameraId, setFocusedCameraId] = useState<string>("");
  const [maximizedCameraId, setMaximizedCameraId] = useState<string | null>(null);
  const [compactPage, setCompactPage] = useState(0);
  const [isWallFullscreen, setIsWallFullscreen] = useState(false);
  const [manuallyStoppedCameraIds, setManuallyStoppedCameraIds] = useState<Set<string>>(
    () => new Set(),
  );
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

  const updateStreamSessionsCache = (
    updater: (
      sessions: CCTVStreamSession[],
    ) => CCTVStreamSession[],
  ) => {
    queryClient.setQueryData<Pagination<CCTVStreamSession> | undefined>(
      ["cctv-stream-sessions", "ACTIVE"],
      (current) => {
        if (!current) return current;
        return {
          ...current,
          data: updater(current.data),
        };
      },
    );
  };

  useEffect(() => {
    const phoneQuery = window.matchMedia("(max-width: 767px)");
    const tabletQuery = window.matchMedia(
      "(min-width: 768px) and (max-width: 1023px)",
    );
    const supportsWebRtc = () =>
      typeof window !== "undefined" &&
      typeof window.RTCPeerConnection !== "undefined";

    const updateViewport = () => {
      const nextWebrtcSupport = supportsWebRtc();
      setWebrtcSupported(nextWebrtcSupport);

      if (phoneQuery.matches) {
        setDeviceViewport("phone");
        setPreferredProtocol(nextWebrtcSupport ? "WEBRTC" : "HLS");
        return;
      }

      if (tabletQuery.matches) {
        setDeviceViewport("tablet");
        setPreferredProtocol(nextWebrtcSupport ? "WEBRTC" : "HLS");
        return;
      }

      setDeviceViewport("desktop");
      setPreferredProtocol(nextWebrtcSupport ? "WEBRTC" : "HLS");
    };

    updateViewport();
    phoneQuery.addEventListener("change", updateViewport);
    tabletQuery.addEventListener("change", updateViewport);

    return () => {
      phoneQuery.removeEventListener("change", updateViewport);
      tabletQuery.removeEventListener("change", updateViewport);
    };
  }, []);

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

  const compactPageSize = useMemo(() => {
    if (deviceViewport === "phone") return 1;
    if (deviceViewport === "tablet") return 2;
    return layoutDensity;
  }, [deviceViewport, layoutDensity]);

  const compactPageCount = useMemo(() => {
    if (maximizedCamera) return 1;
    return Math.max(1, Math.ceil(filteredCameras.length / compactPageSize));
  }, [compactPageSize, filteredCameras.length, maximizedCamera]);

  const normalizedCompactPage = Math.min(compactPage, compactPageCount - 1);

  const wallSlots = useMemo(() => {
    if (maximizedCamera) {
      return [maximizedCamera];
    }

    if (deviceViewport !== "desktop") {
      const pageStart = normalizedCompactPage * compactPageSize;
      return filteredCameras.slice(pageStart, pageStart + compactPageSize);
    }

    return Array.from(
      { length: layoutDensity },
      (_, index) => filteredCameras[index] ?? null,
    );
  }, [
    compactPageSize,
    deviceViewport,
    filteredCameras,
    layoutDensity,
    maximizedCamera,
    normalizedCompactPage,
  ]);

  const visibleWallCameras = useMemo(
    () => wallSlots.filter((camera): camera is Camera => Boolean(camera)),
    [wallSlots],
  );

  const focusedCamera = useMemo(() => {
    if (focusedCameraId) {
      return (
        visibleWallCameras.find((camera) => camera.id === focusedCameraId) ||
        visibleWallCameras[0]
      );
    }
    return visibleWallCameras[0];
  }, [focusedCameraId, visibleWallCameras]);

  const isWallMaximizedToSingleCamera = Boolean(maximizedCamera);
  const isCompactViewport = deviceViewport !== "desktop" && !isWallMaximizedToSingleCamera;
  const shouldAutoStartVisible = deviceViewport === "desktop" || webrtcSupported;

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
        preferredProtocol: preferredProtocol ?? "WEBRTC",
        purpose: "Live monitor",
      }),
    onMutate: (input) => {
      setManuallyStoppedCameraIds((prev) => {
        const next = new Set(prev);
        next.delete(input.cameraId);
        return next;
      });
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
          snapshotUrl: response.snapshotUrl,
          protocol: response.protocol,
        },
      }));
      updateStreamSessionsCache((sessions) => [
        response.session,
        ...sessions.filter(
          (session) =>
            session.id !== response.session.id &&
            !(
              session.cameraId === response.session.cameraId &&
              session.userId === response.session.userId
            ),
        ),
      ]);
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
    mutationFn: (input: {
      sessionId: string;
      cameraId: string;
      suppressAutoStart?: boolean;
    }) =>
      stopCCTVStreamSession(input.sessionId),
    onMutate: ({ sessionId, cameraId, suppressAutoStart }) => {
      if (suppressAutoStart) {
        setManuallyStoppedCameraIds((prev) => new Set(prev).add(cameraId));
      }
      setStoppingSessionIds((prev) => new Set(prev).add(sessionId));
    },
    onSuccess: ({ session }, input) => {
      setStreamHintsByCamera((prev) => {
        const next = { ...prev };
        delete next[input.cameraId];
        return next;
      });
      updateStreamSessionsCache((sessions) =>
        sessions.filter((existingSession) => existingSession.id !== session.id),
      );
      queryClient.invalidateQueries({ queryKey: ["cctv-stream-sessions"] });
    },
    onError: (error) => {
      toast({
        title: "Unable to stop stream",
        description: getApiErrorMessage(error),
        variant: "destructive",
      });
    },
    onSettled: (_, __, { sessionId }) => {
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
        preferredProtocol: preferredProtocol ?? "WEBRTC",
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
          snapshotUrl: response.snapshotUrl,
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
    if (!preferredProtocol || !shouldAutoStartVisible) return;

    visibleWallCameras.forEach((camera) => {
      if (!camera.isOnline) return;
      if (autoStartLocksRef.current.has(camera.id)) return;
      if (manuallyStoppedCameraIds.has(camera.id)) return;
      if (activeSessionByCamera.has(camera.id)) return;

      autoStartLocksRef.current.add(camera.id);
      startSessionMutation.mutate({
        cameraId: camera.id,
        streamType: wallStreamType,
      });
    });
  }, [
    activeSessionByCamera,
    manuallyStoppedCameraIds,
    preferredProtocol,
    shouldAutoStartVisible,
    startSessionMutation,
    visibleWallCameras,
    wallStreamType,
  ]);

  const activeSessionsCount = visibleWallCameras.filter((camera) =>
    activeSessionByCamera.has(camera.id),
  ).length;

  const selectedSiteName =
    sites.find((site) => site.id === selectedSiteId)?.name || "All sites";

  const jumpToCompactCamera = (cameraId: string) => {
    const cameraIndex = filteredCameras.findIndex((camera) => camera.id === cameraId);
    if (cameraIndex === -1) return;
    setFocusedCameraId(cameraId);
    if (deviceViewport === "desktop") return;
    setCompactPage(Math.floor(cameraIndex / compactPageSize));
  };

  const moveCompactPage = (direction: "previous" | "next") => {
    setCompactPage((previousPage) => {
      if (direction === "previous") {
        return previousPage === 0 ? compactPageCount - 1 : previousPage - 1;
      }
      return previousPage === compactPageCount - 1 ? 0 : previousPage + 1;
    });
  };

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
        stopSessionMutation.mutate({
          sessionId: session.id,
          cameraId: camera.id,
          suppressAutoStart: true,
        });
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
            isWallMaximizedToSingleCamera
              ? "grid-cols-1"
              : deviceViewport === "tablet"
                ? "md:grid-cols-2"
                : deviceViewport === "desktop"
                  ? getGridClass(layoutDensity)
                  : "grid-cols-1",
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
            const snapshotUrl = streamHint?.snapshotUrl || null;
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

            const statusState = getCameraStatusState({
              isOnline: camera.isOnline,
              isActive: Boolean(activeSession),
              isSwitching,
              isStarting,
            });

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
                    key={`${activeSession.id}:${streamUrl}:${fallbackUrl || ""}:${snapshotUrl || ""}:${protocol}`}
                    primaryUrl={streamUrl}
                    fallbackUrl={fallbackUrl}
                    snapshotUrl={snapshotUrl}
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

                <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-3 bg-gradient-to-b from-black via-black/72 to-transparent px-3 pb-10 pt-3 text-[11px] font-medium text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.65)]">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate tabular-nums">
                        {new Date().toLocaleString()}
                      </span>
                      <Badge
                        variant={statusState.badgeVariant}
                        className="min-h-4 px-2 py-0 text-[10px] leading-4 shadow-none"
                      >
                        {statusState.label}
                      </Badge>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <StatusDot
                        status={statusState.dotStatus}
                        hideLabel
                        className="text-white"
                        dotClassName="h-2 w-2"
                      />
                      <div className="truncate text-sm font-semibold text-white">
                        {camera.name}
                      </div>
                    </div>
                    <div className="truncate text-xs text-white/68">
                      {camera.area} | {camera.site?.name || "Unknown site"}
                    </div>
                  </div>

                  <div className="pointer-events-auto flex shrink-0 items-center gap-2 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100">
                    {activeSession ? (
                      <Button
                        type="button"
                        variant="destructive"
                        size="icon-sm"
                        onClick={() => {
                          if (isAudible) setAudibleCameraId(null);
                          stopSessionMutation.mutate({
                            sessionId: activeSession.id,
                            cameraId: camera.id,
                            suppressAutoStart: true,
                          });
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
                        variant="default"
                        size="icon-sm"
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
                      variant={isAudible ? "default" : "secondary"}
                      size="icon-sm"
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
                      variant="secondary"
                      size="icon-sm"
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
        <div
          className={cn(
            "absolute inset-x-0 bottom-0 z-30 border-t border-[var(--edge-subtle)] bg-[var(--surface-overlay)] px-2 text-[var(--text-strong)] backdrop-blur-sm",
            isCompactViewport ? "h-24 py-2" : "h-12",
          )}
        >
          <div className="flex h-10 min-w-max items-center gap-2 overflow-x-auto">
            <div className="flex items-center gap-2 pr-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="secondary"
                    className="h-8 px-2.5 shadow-none"
                  >
                    <Building2 className="h-4 w-4" />
                    <span className="ml-1.5 max-w-32 truncate text-xs">
                      {selectedSiteName}
                    </span>
                    <ChevronDown className="ml-1 h-4 w-4 text-muted-foreground" />
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
                    variant="secondary"
                    className="h-8 px-2.5 shadow-none"
                  >
                    <Grid3x3 className="h-4 w-4" />
                    <span className="ml-1.5 text-xs">
                      {layoutOptions.find((option) => option.value === layoutDensity)
                        ?.label || "Layout"}
                    </span>
                    <ChevronDown className="ml-1 h-4 w-4 text-muted-foreground" />
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
                    variant="secondary"
                    className="h-8 px-2.5 shadow-none"
                  >
                    <Video className="h-4 w-4" />
                    <span className="ml-1.5 text-xs">
                      {streamProfileOptions.find(
                        (option) => option.value === wallStreamType,
                      )?.label}
                    </span>
                    <ChevronDown className="ml-1 h-4 w-4 text-muted-foreground" />
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
                variant="destructive"
                className="h-8 px-2.5 shadow-none"
                onClick={stopAllVisible}
                disabled={activeSessionsCount === 0}
              >
                <Square className="mr-1.5 h-4 w-4" />
                <span className="text-xs">Stop</span>
              </Button>
            ) : (
              <Button
                type="button"
                variant="default"
                className="h-8 px-2.5 shadow-none"
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
                variant="secondary"
                className="h-8 px-2.5 shadow-none"
                onClick={() => setMaximizedCameraId(null)}
              >
                <Grid3x3 className="mr-1.5 h-4 w-4" />
                <span className="text-xs">Grid</span>
              </Button>
            ) : null}

            <Button
              type="button"
              variant="secondary"
              size="icon"
              className="h-8 w-8 shadow-none"
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
              variant="secondary"
              size="icon"
              className="h-8 w-8 shadow-none"
              aria-label="Open playback"
              title="Playback"
            >
              <Link href="/cctv/playback">
                <History className="h-4 w-4" />
              </Link>
            </Button>
          </div>

          {isCompactViewport ? (
            <div className="mt-2 flex items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                size="icon"
                className="h-8 w-8 shadow-none"
                onClick={() => moveCompactPage("previous")}
                aria-label="Previous camera view"
                title="Previous"
              >
                <ArrowRight className="h-4 w-4 rotate-180" />
              </Button>

              <div className="flex-1 overflow-x-auto">
                <div className="flex min-w-max items-center gap-2">
                  {filteredCameras.map((camera) => {
                    const isVisible = visibleWallCameras.some(
                      (visibleCamera) => visibleCamera.id === camera.id,
                    );
                    const isActive = activeSessionByCamera.has(camera.id);
                    return (
                      <button
                        key={camera.id}
                        type="button"
                        onClick={() => jumpToCompactCamera(camera.id)}
                        className={cn(
                          "flex h-8 items-center gap-2 rounded-md border px-3 text-xs font-medium transition-colors",
                          isVisible
                            ? "border-[var(--action-primary-bg)] bg-[var(--action-primary-bg)] text-[var(--action-primary-fg)]"
                            : "border-[var(--edge-subtle)] bg-[var(--surface-base)] text-[var(--text-strong)] hover:bg-[var(--surface-subtle)]",
                        )}
                      >
                        <StatusDot
                          status={
                            !camera.isOnline
                              ? "failing"
                              : isActive
                                ? "passing"
                                : "pending"
                          }
                          hideLabel
                          className={cn(
                            isVisible
                              ? "text-[var(--action-primary-fg)]"
                              : "text-[var(--text-strong)]",
                          )}
                          dotClassName="h-2 w-2"
                        />
                        <span className="max-w-28 truncate">{camera.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-[var(--text-muted)] tabular-nums">
                    {normalizedCompactPage + 1}/{compactPageCount}
                </span>
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  className="h-8 w-8 shadow-none"
                  onClick={() => moveCompactPage("next")}
                  aria-label="Next camera view"
                  title="Next"
                >
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
