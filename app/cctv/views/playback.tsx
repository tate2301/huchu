"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import Hls from "hls.js";

import {
  Camera,
  PlaybackClip,
  PlaybackSearchResponse,
  Site,
  StartPlaybackSessionResponse,
  searchCCTVPlayback,
  startCCTVPlaybackSession,
} from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api-client";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import {
  Calendar,
  Camera as CameraIcon,
  Fullscreen,
  FullscreenExit,
  Loader2,
  Play,
  Square,
  Video,
  Volume2,
  VolumeOff,
} from "@/lib/icons";
import { cn } from "@/lib/utils";

type PlaybackViewProps = {
  sites: Site[];
  cameras: Camera[];
};

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function toLocalDateInput(value: Date) {
  const offset = value.getTimezoneOffset();
  return new Date(value.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

function formatDateTime(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function formatTime(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function formatDuration(seconds: number) {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remaining = total % 60;
  return hours > 0
    ? `${hours}:${pad2(minutes)}:${pad2(remaining)}`
    : `${minutes}:${pad2(remaining)}`;
}

function buildIsoFromFields(date: string, time: string) {
  return new Date(`${date}T${time}`).toISOString();
}

function PlaybackPlayer({
  session,
  muted,
}: {
  session: StartPlaybackSessionResponse | null;
  muted: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const sourceUrl = session?.playUrl || session?.fallbackPlayUrl || null;
  const displayStatus = sourceUrl
    ? status === "ready" || status === "error"
      ? status
      : "loading"
    : "idle";

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (!sourceUrl) {
      video.pause();
      video.removeAttribute("src");
      video.load();
      return;
    }

    let hls: Hls | null = null;
    let cancelled = false;

    const finishReady = () => {
      if (!cancelled) setStatus("ready");
    };
    const fail = () => {
      if (!cancelled) setStatus("error");
    };

    video.muted = muted;
    video.autoplay = true;
    video.playsInline = true;
    video.preload = "auto";

    const attach = async () => {
      try {
        if (/\.m3u8($|\?)/i.test(sourceUrl) && Hls.isSupported()) {
          hls = new Hls({ enableWorker: true, lowLatencyMode: true });
          hls.loadSource(sourceUrl);
          hls.attachMedia(video);
          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            void video.play().catch(() => undefined);
          });
          hls.on(Hls.Events.ERROR, (_, data) => {
            if (data.fatal) fail();
          });
        } else {
          video.src = sourceUrl;
          void video.play().catch(() => undefined);
        }
      } catch {
        fail();
      }
    };

    const onLoadedData = () => finishReady();
    const onPlaying = () => finishReady();
    const onError = () => fail();

    video.addEventListener("loadeddata", onLoadedData);
    video.addEventListener("playing", onPlaying);
    video.addEventListener("error", onError);
    void attach();

    return () => {
      cancelled = true;
      video.removeEventListener("loadeddata", onLoadedData);
      video.removeEventListener("playing", onPlaying);
      video.removeEventListener("error", onError);
      hls?.destroy();
      video.pause();
      video.removeAttribute("src");
      video.load();
    };
  }, [muted, session?.streamPath, sourceUrl]);

  return (
    <div className="relative min-h-[56vh] bg-black xl:min-h-[70vh]">
      <video ref={videoRef} className="h-full w-full object-contain" muted={muted} playsInline />
      {displayStatus !== "ready" ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-white/60">
          {displayStatus === "error" ? "Playback unavailable" : displayStatus === "loading" ? "Loading clip..." : "No clip loaded"}
        </div>
      ) : null}
    </div>
  );
}

export function PlaybackView({ sites, cameras }: PlaybackViewProps) {
  const { toast } = useToast();
  const frameRef = useRef<HTMLDivElement | null>(null);
  const initial = useMemo(() => {
    const value = new Date();
    value.setMinutes(value.getMinutes() - 30, 0, 0);
    return value;
  }, []);

  const [cameraId, setCameraId] = useState(cameras[0]?.id ?? "");
  const [selectedDate, setSelectedDate] = useState(toLocalDateInput(initial));
  const [timeValue, setTimeValue] = useState(
    `${pad2(initial.getHours())}:${pad2(initial.getMinutes())}:${pad2(initial.getSeconds())}`,
  );
  const [windowMinutes, setWindowMinutes] = useState("60");
  const [recordType, setRecordType] = useState("all");
  const [result, setResult] = useState<PlaybackSearchResponse | null>(null);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [activeSession, setActiveSession] = useState<StartPlaybackSessionResponse | null>(null);
  const [draftSeekSeconds, setDraftSeekSeconds] = useState(0);
  const [draggingSeek, setDraggingSeek] = useState(false);
  const [muted, setMuted] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const selectedCamera = useMemo(
    () => cameras.find((camera) => camera.id === cameraId) ?? null,
    [cameraId, cameras],
  );
  const selectedClip = useMemo(
    () => result?.clips.find((clip) => clip.id === selectedClipId) ?? result?.clips[0] ?? null,
    [result, selectedClipId],
  );

  const searchStart = useMemo(
    () => buildIsoFromFields(selectedDate, timeValue || "00:00:00"),
    [selectedDate, timeValue],
  );
  const searchEnd = useMemo(() => {
    const start = new Date(searchStart);
    start.setMinutes(start.getMinutes() + Number(windowMinutes || 60));
    return start.toISOString();
  }, [searchStart, windowMinutes]);

  const currentSeekSeconds = useMemo(() => {
    if (!selectedClip) return 0;
    const current = activeSession?.seekTime || selectedClip.startTime;
    return Math.max(
      0,
      Math.floor((new Date(current).getTime() - new Date(selectedClip.startTime).getTime()) / 1000),
    );
  }, [activeSession?.seekTime, selectedClip]);

  useEffect(() => {
    const onFullscreenChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  const startMutation = useMutation({
    mutationFn: (input: {
      playbackRecordId?: string;
      token?: string;
      seekTime?: string;
      preferredProtocol?: "WEBRTC" | "HLS";
      purpose?: string;
    }) => startCCTVPlaybackSession(input),
    onSuccess: (data) => setActiveSession(data),
    onError: (error) => {
      toast({
        title: "Playback failed",
        description: getApiErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  const searchMutation = useMutation({
    mutationFn: searchCCTVPlayback,
    onSuccess: (data) => {
      setResult(data);
      if (!data.clips.length) {
        setSelectedClipId(null);
        setActiveSession(null);
        toast({ title: "No clips found", description: "No recordings matched the selected window." });
        return;
      }

      const firstClip = data.clips[0];
      setSelectedClipId(firstClip.id);
      startMutation.mutate({
        playbackRecordId: firstClip.id,
        token: firstClip.token,
        preferredProtocol: "HLS",
        purpose: "Playback review",
      });
    },
    onError: (error) => {
      toast({
        title: "Playback search failed",
        description: getApiErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  const runSearch = () => {
    setFormError(null);
    if (!cameraId) {
      setFormError("Select a camera.");
      return;
    }

    const start = new Date(searchStart);
    const end = new Date(searchEnd);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start >= end) {
      setFormError("Choose a valid playback window.");
      return;
    }

    searchMutation.mutate({
      cameraId,
      startTime: start.toISOString(),
      endTime: end.toISOString(),
      recordType,
      purpose: "Playback review",
      page: 1,
      limit: 50,
    });
  };

  const startClip = (clip: PlaybackClip, seekTime?: string) => {
    setSelectedClipId(clip.id);
    startMutation.mutate({
      playbackRecordId: clip.id,
      token: clip.token,
      seekTime,
      preferredProtocol: "HLS",
      purpose: "Playback review",
    });
  };

  const commitSeek = (seconds: number) => {
    if (!selectedClip) return;
    const clamped = Math.max(0, Math.min(seconds, selectedClip.duration));
    const seekTime = new Date(new Date(selectedClip.startTime).getTime() + clamped * 1000).toISOString();
    startClip(selectedClip, seekTime);
  };

  const toggleFullscreen = async () => {
    if (!frameRef.current) return;
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await frameRef.current.requestFullscreen();
    }
  };

  const timelineSpan = Math.max(new Date(searchEnd).getTime() - new Date(searchStart).getTime(), 1);
  const sliderValue = draggingSeek ? draftSeekSeconds : currentSeekSeconds;

  return (
    <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
      <aside className="overflow-hidden border border-[var(--edge-default)] bg-[var(--surface-base)]">
        <div className="space-y-4 px-4 py-4">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Playback</div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Camera</label>
            <Select value={cameraId} onValueChange={setCameraId}>
              <SelectTrigger><SelectValue placeholder="Select camera" /></SelectTrigger>
              <SelectContent>
                {cameras.map((camera) => (
                  <SelectItem key={camera.id} value={camera.id}>{camera.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Date</label>
            <div className="relative">
              <Calendar className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} className="pl-10" />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Start time</label>
            <Input value={timeValue} onChange={(event) => setTimeValue(event.target.value)} placeholder="HH:MM:SS" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Window</label>
              <Select value={windowMinutes} onValueChange={setWindowMinutes}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="30">30 min</SelectItem>
                  <SelectItem value="60">60 min</SelectItem>
                  <SelectItem value="120">120 min</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Type</label>
              <Select value={recordType} onValueChange={setRecordType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="continuous">Continuous</SelectItem>
                  <SelectItem value="motion">Motion</SelectItem>
                  <SelectItem value="alarm">Alarm</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {formError ? <Alert variant="destructive"><AlertDescription>{formError}</AlertDescription></Alert> : null}

          <Button type="button" className="w-full" onClick={runSearch} disabled={searchMutation.isPending}>
            {searchMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Video className="mr-2 h-4 w-4" />}
            Search Playback
          </Button>
        </div>

        <div className="border-t border-[var(--edge-default)]">
          <div className="flex items-center justify-between px-4 py-3 text-xs">
            <span className="font-medium text-foreground">{result?.totalClips ?? 0} clips</span>
            <span className="text-muted-foreground">{selectedCamera?.site?.name || sites[0]?.name || "All sites"}</span>
          </div>

          <div className="max-h-[48vh] overflow-auto">
            {result?.clips.length ? result.clips.map((clip) => {
              const active = clip.id === selectedClip?.id;
              return (
                <button
                  key={clip.id}
                  type="button"
                  onClick={() => startClip(clip)}
                  className={cn(
                    "flex w-full items-start justify-between gap-3 border-t border-[var(--edge-default)] px-4 py-3 text-left transition-colors",
                    active ? "bg-[var(--surface-muted)]" : "hover:bg-[var(--surface-muted)]/70",
                  )}
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-foreground">{formatTime(clip.startTime)} to {formatTime(clip.endTime)}</div>
                    <div className="text-xs text-muted-foreground">{clip.recordingType}</div>
                  </div>
                  <div className="shrink-0 text-xs text-muted-foreground">{formatDuration(clip.duration)}</div>
                </button>
              );
            }) : <div className="border-t border-[var(--edge-default)] px-4 py-8 text-sm text-muted-foreground">No clips loaded.</div>}
          </div>
        </div>
      </aside>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3 border border-[var(--edge-default)] bg-[var(--surface-base)] px-4 py-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <CameraIcon className="h-4 w-4 text-muted-foreground" />
              <span className="truncate">{selectedCamera?.name || "Playback"}</span>
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {selectedClip ? `${formatDateTime(selectedClip.startTime)} to ${formatDateTime(selectedClip.endTime)}` : `${formatDateTime(searchStart)} to ${formatDateTime(searchEnd)}`}
            </div>
          </div>
          <div className="text-xs text-muted-foreground">{selectedCamera?.area || "No area"}</div>
        </div>

        <div ref={frameRef} className="overflow-hidden border border-[var(--edge-default)] bg-black">
          <PlaybackPlayer key={activeSession?.streamPath ?? "idle"} session={activeSession} muted={muted} />
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 bg-[#0f0f11] px-4 py-3">
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                onClick={() => selectedClip && startClip(selectedClip, activeSession?.seekTime || selectedClip.startTime)}
                disabled={!selectedClip || startMutation.isPending}
                className="bg-[var(--status-success-bg)] text-[var(--status-success-text)] hover:bg-[var(--status-success-bg)]/90"
              >
                {startMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setActiveSession(null)}
                disabled={!activeSession}
                className="border-white/15 bg-transparent text-white hover:bg-white/5"
              >
                <Square className="h-4 w-4" />
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => commitSeek(currentSeekSeconds - 15)} disabled={!selectedClip || startMutation.isPending} className="border-white/15 bg-transparent text-white hover:bg-white/5">-15s</Button>
              <Button type="button" size="sm" variant="outline" onClick={() => commitSeek(currentSeekSeconds + 15)} disabled={!selectedClip || startMutation.isPending} className="border-white/15 bg-transparent text-white hover:bg-white/5">+15s</Button>
            </div>
            <div className="flex items-center gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => setMuted((current) => !current)} className="border-white/15 bg-transparent text-white hover:bg-white/5">
                {muted ? <VolumeOff className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={toggleFullscreen} className="border-white/15 bg-transparent text-white hover:bg-white/5">
                {fullscreen ? <FullscreenExit className="h-4 w-4" /> : <Fullscreen className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </div>

        <div className="overflow-hidden border border-[var(--edge-default)] bg-[var(--surface-base)]">
          <div className="relative border-b border-[var(--edge-default)] px-4 py-6">
            <div className="relative h-10 border-t border-[var(--edge-default)]">
              {Array.from({ length: 7 }, (_, index) => {
                const position = (index / 6) * 100;
                const label = formatTime(new Date(new Date(searchStart).getTime() + (new Date(searchEnd).getTime() - new Date(searchStart).getTime()) * (index / 6)));
                return (
                  <div key={`${label}-${position}`} className="absolute top-0 h-full border-l border-[var(--edge-default)]" style={{ left: `${position}%` }}>
                    <div className="absolute -top-5 left-0 -translate-x-1/2 text-[10px] text-muted-foreground">{label}</div>
                  </div>
                );
              })}

              {result?.clips.map((clip) => {
                const left = ((new Date(clip.startTime).getTime() - new Date(searchStart).getTime()) / timelineSpan) * 100;
                const width = Math.max(((new Date(clip.endTime).getTime() - new Date(clip.startTime).getTime()) / timelineSpan) * 100, 0.75);
                return (
                  <button
                    key={clip.id}
                    type="button"
                    onClick={() => startClip(clip)}
                    className={cn("absolute top-3 h-3 bg-[var(--brand-primary)]", clip.id === selectedClip?.id ? "ring-2 ring-[var(--brand-primary)]/30" : "opacity-80")}
                    style={{ left: `${Math.max(0, left)}%`, width: `${width}%` }}
                  />
                );
              })}
            </div>
          </div>

          <div className="space-y-3 px-4 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
              <span>{selectedClip ? formatDateTime(selectedClip.startTime) : "Clip start"}</span>
              <span>{selectedClip ? `${formatTime(new Date(new Date(selectedClip.startTime).getTime() + sliderValue * 1000))} · ${formatDuration(sliderValue)}` : "No clip selected"}</span>
              <span>{selectedClip ? formatDateTime(selectedClip.endTime) : "Clip end"}</span>
            </div>

            <input
              type="range"
              min={0}
              max={selectedClip?.duration ?? 0}
              value={selectedClip ? sliderValue : 0}
              onChange={(event) => setDraftSeekSeconds(Number(event.target.value))}
              onMouseDown={() => setDraggingSeek(true)}
              onMouseUp={() => {
                setDraggingSeek(false);
                commitSeek(draftSeekSeconds);
              }}
              onTouchStart={() => setDraggingSeek(true)}
              onTouchEnd={() => {
                setDraggingSeek(false);
                commitSeek(draftSeekSeconds);
              }}
              disabled={!selectedClip || startMutation.isPending}
              className="h-2 w-full accent-[var(--brand-primary)]"
            />
          </div>
        </div>
      </section>
    </div>
  );
}
