"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";

import {
  Camera,
  PlaybackSearchResponse,
  Site,
  searchCCTVPlayback,
} from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api-client";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import {
  Camera as CameraIcon,
  Calendar,
  ChevronRight,
  Clock,
  Grid3x3,
  RefreshCcw as Refresh,
  Video,
} from "@/lib/icons";
import { cn } from "@/lib/utils";

type PlaybackViewProps = {
  sites: Site[];
  cameras: Camera[];
};

type CalendarDay = {
  date: Date;
  isoDate: string;
  inMonth: boolean;
};

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function toLocalDateInput(value: Date) {
  const timezoneOffset = value.getTimezoneOffset();
  const localDate = new Date(value.getTime() - timezoneOffset * 60_000);
  return localDate.toISOString().slice(0, 10);
}

function combineDateAndClock(date: string, clock: string) {
  return new Date(`${date}T${clock}`);
}

function addMinutes(value: Date, minutes: number) {
  return new Date(value.getTime() + minutes * 60_000);
}

function sameDate(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function buildCalendarDays(monthDate: Date) {
  const firstDay = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const startOffset = firstDay.getDay();
  const gridStart = new Date(firstDay);
  gridStart.setDate(firstDay.getDate() - startOffset);

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + index);
    return {
      date,
      isoDate: toLocalDateInput(date),
      inMonth: date.getMonth() === monthDate.getMonth(),
    } satisfies CalendarDay;
  });
}

function formatMonthLabel(value: Date) {
  return value.toLocaleDateString(undefined, {
    month: "short",
    year: "numeric",
  });
}

function formatTimelineLabel(value: Date) {
  return value.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatCompactDateTime(value: Date) {
  return value.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function clockLabelFromParts(hour: string, minute: string, second: string) {
  return `${hour || "00"}:${minute || "00"}:${second || "00"}`;
}

function clipTone(recordingType: string, index: number) {
  const value = recordingType.toLowerCase();
  if (value.includes("alarm")) return "bg-[#ef476f]";
  if (value.includes("command")) return "bg-[#20c997]";
  if (value.includes("continuous")) return "bg-[#7c8cff]";
  return index % 2 === 0 ? "bg-[#7c8cff]" : "bg-[#20c997]";
}

export function PlaybackView({ sites, cameras }: PlaybackViewProps) {
  const { toast } = useToast();
  const [cameraId, setCameraId] = useState<string>("");
  const [calendarMonth, setCalendarMonth] = useState<Date>(() => new Date());
  const [selectedDate, setSelectedDate] = useState<string>(() =>
    toLocalDateInput(new Date()),
  );
  const [hour, setHour] = useState("00");
  const [minute, setMinute] = useState("00");
  const [second, setSecond] = useState("00");
  const windowMinutes = 60;
  const [result, setResult] = useState<PlaybackSearchResponse | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [copiedClipUri, setCopiedClipUri] = useState<string | null>(null);
  const [focusedPaneIndex, setFocusedPaneIndex] = useState(0);
  const [selectedClipIndex, setSelectedClipIndex] = useState(0);

  useEffect(() => {
    if (!copiedClipUri) return;
    const timeout = window.setTimeout(() => setCopiedClipUri(null), 1800);
    return () => window.clearTimeout(timeout);
  }, [copiedClipUri]);

  const activeCameraId = cameraId || cameras[0]?.id || "";
  const selectedCamera = useMemo(
    () => cameras.find((camera) => camera.id === activeCameraId) ?? null,
    [activeCameraId, cameras],
  );

  const searchStart = useMemo(() => {
    const clock = clockLabelFromParts(hour, minute, second);
    return combineDateAndClock(selectedDate, clock);
  }, [hour, minute, second, selectedDate]);

  const searchEnd = useMemo(
    () => addMinutes(searchStart, windowMinutes),
    [searchStart],
  );

  const selectedClip = useMemo(
    () => result?.clips[selectedClipIndex] ?? result?.clips[0] ?? null,
    [result, selectedClipIndex],
  );

  const clipDays = useMemo(() => {
    const days = new Set<string>();
    result?.clips.forEach((clip) =>
      days.add(toLocalDateInput(new Date(clip.startTime))),
    );
    return days;
  }, [result]);

  const wallCameras = useMemo(() => {
    const ordered = selectedCamera
      ? [
          selectedCamera,
          ...cameras.filter((camera) => camera.id !== selectedCamera.id),
        ]
      : cameras;
    return ordered.slice(0, 16);
  }, [cameras, selectedCamera]);

  const wallSlots = useMemo(
    () => Array.from({ length: 16 }, (_, index) => wallCameras[index] ?? null),
    [wallCameras],
  );

  const calendarDays = useMemo(
    () => buildCalendarDays(calendarMonth),
    [calendarMonth],
  );

  const playbackSearchMutation = useMutation({
    mutationFn: (input: {
      cameraId: string;
      startTime: string;
      endTime: string;
      purpose?: string;
      page?: number;
      limit?: number;
    }) => searchCCTVPlayback(input),
    onSuccess: (data) => {
      setResult(data);
      setSelectedClipIndex(0);
      toast({
        title: "Playback results ready",
        description: `Found ${data.totalClips} clip(s) for the selected period.`,
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

  const clipCount = result?.clips.length ?? 0;
  const totalMinutes =
    result?.clips.reduce((sum, clip) => sum + clip.duration / 60, 0) ?? 0;
  const activeSiteName =
    selectedCamera?.site?.name || sites[0]?.name || "All sites";
  const selectedPaneLabel = `No.: ${selectedCamera?.channelNumber ?? 1}`;

  const runSearch = () => {
    setFormError(null);
    if (!activeCameraId) {
      setFormError("Select a camera before searching.");
      return;
    }

    if (!selectedDate || !hour || !minute || !second) {
      setFormError("Pick a date and playback time first.");
      return;
    }

    const start = searchStart;
    const end = searchEnd;

    if (
      Number.isNaN(start.getTime()) ||
      Number.isNaN(end.getTime()) ||
      start >= end
    ) {
      setFormError("The playback time must produce a valid range.");
      return;
    }

    playbackSearchMutation.mutate({
      cameraId: activeCameraId,
      startTime: start.toISOString(),
      endTime: end.toISOString(),
      purpose: "Playback review",
      limit: 50,
      page: 1,
    });
  };

  const copyClipUri = async () => {
    if (!selectedClip) return;
    await navigator.clipboard.writeText(selectedClip.playbackUri);
    setCopiedClipUri(selectedClip.playbackUri);
    toast({
      title: "Playback URI copied",
      description: "The selected clip link is on your clipboard.",
    });
  };

  const clipTimelineStart = result
    ? new Date(result.searchParams.startTime)
    : searchStart;
  const clipTimelineEnd = result
    ? new Date(result.searchParams.endTime)
    : searchEnd;
  const timelineSpan = Math.max(
    clipTimelineEnd.getTime() - clipTimelineStart.getTime(),
    1,
  );
  const timelineMarks = Array.from({ length: 13 }, (_, index) => {
    const mark = new Date(
      clipTimelineStart.getTime() + (timelineSpan / 12) * index,
    );
    return {
      label: formatTimelineLabel(mark),
      position: (index / 12) * 100,
    };
  });

  return (
    <div className="space-y-3">
      <div className="grid gap-3 xl:grid-cols-[220px_minmax(0,1fr)_240px]">
        <aside className="border border-[var(--edge-default)] bg-[var(--surface-base)] shadow-[var(--surface-frame-shadow)]">
          <div className="border-b border-[var(--edge-default)] px-3 py-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Grid3x3 className="h-4 w-4 text-muted-foreground" />
              Network Video Recorder
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              Channel {selectedCamera?.channelNumber ?? 1} | {activeSiteName}
            </div>
          </div>

          <div className="max-h-[700px] space-y-1 overflow-auto px-2 py-2">
            {cameras.length > 0 ? (
              cameras.map((camera, index) => {
                const isActive = camera.id === activeCameraId;
                const onlineTone = camera.isOnline
                  ? "text-[var(--status-success-text)]"
                  : "text-[var(--status-error-text)]";
                return (
                  <button
                    key={camera.id}
                    type="button"
                    onClick={() => {
                      setCameraId(camera.id);
                      setFocusedPaneIndex(index < 16 ? index : 0);
                    }}
                    className={cn(
                      "flex w-full items-center gap-2 px-2 py-1.5 text-left text-[13px] transition-colors",
                      isActive
                        ? "bg-[#fff3f3] text-[#d11f26]"
                        : "text-foreground hover:bg-[var(--surface-muted)]",
                    )}
                  >
                    <CameraIcon
                      className={cn(
                        "h-3.5 w-3.5 shrink-0",
                        isActive ? "text-[#d11f26]" : onlineTone,
                      )}
                    />
                    <span className="min-w-0 flex-1 truncate">
                      {camera.name}
                    </span>
                    {isActive ? (
                      <span className="text-[#d11f26]">▸</span>
                    ) : null}
                  </button>
                );
              })
            ) : (
              <div className="px-3 py-6 text-sm text-muted-foreground">
                No cameras configured yet.
              </div>
            )}
          </div>
        </aside>

        <main className="space-y-2">
          <div className="flex items-center justify-between px-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            <div>{selectedPaneLabel}</div>
            <div>
              {selectedCamera ? selectedCamera.name : "Select a camera"}
            </div>
            <div>
              {playbackSearchMutation.isPending
                ? "Buffering..."
                : "Current play wall"}
            </div>
          </div>

          <section className="overflow-hidden border border-[var(--edge-default)] bg-[#1f1f1f]">
            <div className="grid min-h-[700px] grid-cols-4 grid-rows-4 gap-px bg-[#191919] p-px">
              {wallSlots.map((camera, index) => {
                const active = index === focusedPaneIndex;
                return (
                  <button
                    key={camera?.id ?? `empty-${index}`}
                    type="button"
                    onClick={() => {
                      if (camera) {
                        setCameraId(camera.id);
                      }
                      setFocusedPaneIndex(index);
                    }}
                    className={cn(
                      "relative flex min-h-0 flex-col justify-between overflow-hidden bg-[#3b3b3b] text-left text-white transition-colors",
                      active
                        ? "outline outline-1 outline-[#efc93c]"
                        : "outline outline-1 outline-[#242424]",
                    )}
                  >
                    <div className="flex items-start justify-between gap-2 px-2 py-2 text-[11px]">
                      <div className="min-w-0">
                        <div className="truncate font-medium">
                          {camera ? camera.name : `Channel ${index + 1}`}
                        </div>
                        <div className="truncate text-white/65">
                          {camera ? camera.area : "No signal"}
                        </div>
                      </div>
                      <div className="shrink-0 text-white/65">
                        {camera ? pad2(camera.channelNumber) : "--"}
                      </div>
                    </div>

                    <div className="flex flex-1 items-center justify-center border-y border-black/20 bg-[#323232]">
                      <div className="space-y-1 text-center">
                        <div className="text-[10px] uppercase tracking-[0.24em] text-white/50">
                          {camera
                            ? camera.isOnline
                              ? "Live ready"
                              : "Offline"
                            : "Empty pane"}
                        </div>
                        <div className="text-sm font-semibold text-white/90">
                          {camera
                            ? index === focusedPaneIndex
                              ? "Focused playback"
                              : "Channel view"
                            : "Awaiting source"}
                        </div>
                        {result &&
                        camera?.id === cameraId &&
                        index === focusedPaneIndex ? (
                          <div className="text-[11px] text-white/55">
                            {selectedClip
                              ? `${formatCompactDateTime(new Date(selectedClip.startTime))} - ${formatCompactDateTime(new Date(selectedClip.endTime))}`
                              : "Search complete"}
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <div className="flex items-center justify-between px-2 py-1.5 text-[10px] text-white/70">
                      <span>
                        {camera
                          ? (camera.site?.name ?? activeSiteName)
                          : "No site"}
                      </span>
                      <span>
                        {camera
                          ? camera.isOnline
                            ? "Online"
                            : "Offline"
                          : "Idle"}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#d8d8d8] bg-[#f5f5f5] px-3 py-2 text-[12px] text-[#222]">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  className="h-7 w-7 border border-transparent bg-transparent text-[#555] transition-colors hover:border-[#cfcfcf] hover:bg-white"
                >
                  ▦
                </button>
                <button
                  type="button"
                  className="h-7 w-7 border border-transparent bg-transparent text-[#555] transition-colors hover:border-[#cfcfcf] hover:bg-white"
                >
                  ▾
                </button>
                <button
                  type="button"
                  className="h-7 w-7 border border-transparent bg-transparent text-[#555] transition-colors hover:border-[#cfcfcf] hover:bg-white"
                >
                  ☼
                </button>
                <button
                  type="button"
                  className="h-7 w-7 border border-transparent bg-transparent text-[#555] transition-colors hover:border-[#cfcfcf] hover:bg-white"
                >
                  ⤴
                </button>
              </div>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  className="h-7 w-7 border border-transparent bg-transparent text-[#555] transition-colors hover:border-[#cfcfcf] hover:bg-white"
                >
                  ◀
                </button>
                <button
                  type="button"
                  className="h-7 w-7 border border-transparent bg-transparent text-[#555] transition-colors hover:border-[#cfcfcf] hover:bg-white"
                >
                  ■
                </button>
                <button
                  type="button"
                  className="h-7 w-7 border border-transparent bg-transparent text-[#555] transition-colors hover:border-[#cfcfcf] hover:bg-white"
                >
                  ◀◀
                </button>
                <button
                  type="button"
                  className="h-7 w-7 border border-transparent bg-transparent text-[#555] transition-colors hover:border-[#cfcfcf] hover:bg-white"
                >
                  ▶
                </button>
                <button
                  type="button"
                  className="h-7 w-7 border border-transparent bg-transparent text-[#555] transition-colors hover:border-[#cfcfcf] hover:bg-white"
                >
                  ▶▶
                </button>
                <button
                  type="button"
                  className="h-7 w-7 border border-transparent bg-transparent text-[#555] transition-colors hover:border-[#cfcfcf] hover:bg-white"
                >
                  ▷|
                </button>
              </div>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  className="h-7 w-7 border border-transparent bg-transparent text-[#555] transition-colors hover:border-[#cfcfcf] hover:bg-white"
                >
                  ▣
                </button>
                <button
                  type="button"
                  className="h-7 w-7 border border-transparent bg-transparent text-[#555] transition-colors hover:border-[#cfcfcf] hover:bg-white"
                >
                  ⌁
                </button>
                <button
                  type="button"
                  className="h-7 w-7 border border-transparent bg-transparent text-[#555] transition-colors hover:border-[#cfcfcf] hover:bg-white"
                >
                  ✂
                </button>
                <button
                  type="button"
                  className="h-7 w-7 border border-transparent bg-transparent text-[#555] transition-colors hover:border-[#cfcfcf] hover:bg-white"
                >
                  +
                </button>
                <button
                  type="button"
                  className="h-7 w-7 border border-transparent bg-transparent text-[#555] transition-colors hover:border-[#cfcfcf] hover:bg-white"
                >
                  🔊
                </button>
                <button
                  type="button"
                  className="h-7 w-7 border border-transparent bg-transparent text-[#555] transition-colors hover:border-[#cfcfcf] hover:bg-white"
                >
                  ⬇
                </button>
                <button
                  type="button"
                  className="h-7 w-7 border border-transparent bg-transparent text-[#555] transition-colors hover:border-[#cfcfcf] hover:bg-white"
                >
                  ⛶
                </button>
              </div>
            </div>
          </section>

          <div className="flex flex-wrap items-center justify-between gap-3 border border-[var(--edge-default)] bg-[var(--surface-base)] px-3 py-2 text-xs">
            <div className="flex min-w-0 flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-muted-foreground">Playback window</span>
                <span className="font-medium text-foreground">
                  {formatCompactDateTime(clipTimelineStart)} to{" "}
                  {formatCompactDateTime(clipTimelineEnd)}
                </span>
              </div>
              <div className="text-muted-foreground">
                {clipCount > 0
                  ? `${clipCount} clip(s) found`
                  : "No clips loaded yet"}
              </div>
              <div className="text-muted-foreground">
                {Math.max(0, Math.round(totalMinutes))} min total
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={runSearch}
                disabled={playbackSearchMutation.isPending}
              >
                <Refresh className="mr-2 h-4 w-4" />
                {playbackSearchMutation.isPending
                  ? "Searching..."
                  : "Refresh search"}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={copyClipUri}
                disabled={!selectedClip}
              >
                Copy URI
              </Button>
              {selectedClip ? (
                <Button asChild size="sm">
                  <a
                    href={selectedClip.playbackUri}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open clip
                  </a>
                </Button>
              ) : null}
            </div>
          </div>
        </main>

        <aside className="space-y-3">
          <div className="text-right text-xs font-semibold uppercase tracking-[0.18em] text-foreground">
            Current Status:
          </div>

          <section className="border border-[var(--edge-default)] bg-[var(--surface-base)] shadow-[var(--surface-frame-shadow)]">
            <div className="border-b border-[var(--edge-default)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-foreground">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                {formatMonthLabel(calendarMonth)}
              </div>
            </div>

            <div className="px-2 py-2">
              <div className="grid grid-cols-7 text-center text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((day) => (
                  <div key={day} className="py-1">
                    {day}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-px border border-[var(--edge-default)] bg-[var(--edge-default)]">
                {calendarDays.map((day) => {
                  const isSelected = day.isoDate === selectedDate;
                  const hasClip = clipDays.has(day.isoDate);
                  const isToday = sameDate(day.date, new Date());
                  return (
                    <button
                      key={day.isoDate}
                      type="button"
                      onClick={() => {
                        setSelectedDate(day.isoDate);
                        setCalendarMonth(
                          new Date(
                            day.date.getFullYear(),
                            day.date.getMonth(),
                            1,
                          ),
                        );
                      }}
                      className={cn(
                        "relative min-h-10 bg-white px-1 py-1 text-center text-[12px] transition-colors",
                        day.inMonth
                          ? "text-foreground"
                          : "text-muted-foreground/40",
                        isSelected
                          ? "bg-[#ef3b3b] text-white"
                          : "hover:bg-[var(--surface-muted)]",
                        isToday && !isSelected
                          ? "ring-1 ring-inset ring-[#f1c94c]"
                          : "",
                      )}
                    >
                      <span className="block leading-none">
                        {day.date.getDate()}
                      </span>
                      {hasClip ? (
                        <span
                          className={cn(
                            "absolute right-1 top-1 h-1.5 w-1.5 rotate-45",
                            isSelected ? "bg-white" : "bg-[#4f83ff]",
                          )}
                        />
                      ) : null}
                    </button>
                  );
                })}
              </div>

              <Button
                type="button"
                className="mt-3 h-10 w-full bg-[#e11d25] text-white hover:bg-[#c8161d]"
                onClick={runSearch}
                disabled={playbackSearchMutation.isPending}
              >
                <Video className="mr-2 h-4 w-4" />
                {playbackSearchMutation.isPending ? "Searching..." : "Search"}
              </Button>
            </div>
          </section>

          <section className="border border-[var(--edge-default)] bg-[var(--surface-base)] shadow-[var(--surface-frame-shadow)]">
            <div className="border-b border-[var(--edge-default)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-foreground">
              Set playback time
            </div>
            <div className="space-y-3 px-3 py-3">
              {formError ? (
                <Alert variant="destructive">
                  <AlertTitle>Cannot search yet</AlertTitle>
                  <AlertDescription>{formError}</AlertDescription>
                </Alert>
              ) : null}

              <div className="flex items-center gap-2">
                <div className="flex flex-1 items-center gap-1">
                  <Input
                    value={hour}
                    onChange={(event) =>
                      setHour(event.target.value.replace(/\D/g, "").slice(0, 2))
                    }
                    inputMode="numeric"
                    maxLength={2}
                    className="h-10 w-12 px-0 text-center"
                  />
                  <span className="text-sm text-muted-foreground">:</span>
                  <Input
                    value={minute}
                    onChange={(event) =>
                      setMinute(
                        event.target.value.replace(/\D/g, "").slice(0, 2),
                      )
                    }
                    inputMode="numeric"
                    maxLength={2}
                    className="h-10 w-12 px-0 text-center"
                  />
                  <span className="text-sm text-muted-foreground">:</span>
                  <Input
                    value={second}
                    onChange={(event) =>
                      setSecond(
                        event.target.value.replace(/\D/g, "").slice(0, 2),
                      )
                    }
                    inputMode="numeric"
                    maxLength={2}
                    className="h-10 w-12 px-0 text-center"
                  />
                </div>
                <Button
                  type="button"
                  className="h-10 px-4"
                  onClick={runSearch}
                  disabled={playbackSearchMutation.isPending}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>

              <p className="text-[11px] leading-5 text-muted-foreground">
                Searches a {windowMinutes}-minute window from the entered
                playback time.
              </p>
            </div>
          </section>

          <section className="border border-[var(--edge-default)] bg-[var(--surface-base)] shadow-[var(--surface-frame-shadow)]">
            <div className="border-b border-[var(--edge-default)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-foreground">
              Playback details
            </div>
            <div className="space-y-2 px-3 py-3 text-xs">
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Camera</span>
                <span className="font-medium text-foreground">
                  {selectedCamera?.name || "None selected"}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Site</span>
                <span className="font-medium text-foreground">
                  {selectedCamera?.site?.name || activeSiteName}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Area</span>
                <span className="font-medium text-foreground">
                  {selectedCamera?.area || "-"}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Playback URI</span>
                <span className="max-w-[140px] truncate font-medium text-foreground">
                  {selectedClip?.playbackUri || "-"}
                </span>
              </div>
              {copiedClipUri ? (
                <div className="pt-1 text-[11px] text-[var(--status-success-text)]">
                  Copied to clipboard.
                </div>
              ) : null}
            </div>
          </section>
        </aside>
      </div>

      <section className="border border-[var(--edge-default)] bg-[#050505] text-white shadow-[var(--surface-frame-shadow)]">
        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-3 py-2 text-[11px]">
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded border border-white/15 bg-white/5 px-2 py-1 text-white/80 transition-colors hover:bg-white/10"
            >
              ⇆
            </button>
            <button
              type="button"
              className="rounded border border-white/15 bg-white/5 px-2 py-1 text-white/80 transition-colors hover:bg-white/10"
            >
              ⇢
            </button>
          </div>
          <div className="font-medium">
            {formatCompactDateTime(clipTimelineStart)} |{" "}
            {formatCompactDateTime(clipTimelineEnd)}
          </div>
          <div className="flex items-center gap-2 text-white/80">
            <span className="inline-flex items-center gap-1">
              <span className="h-2.5 w-2.5 bg-[#20c997]" />
              Command Triggered
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2.5 w-2.5 bg-[#7c8cff]" />
              Continuous
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2.5 w-2.5 bg-[#ef476f]" />
              Alarm
            </span>
          </div>
        </div>

        <div className="relative h-20 border-b border-white/10 bg-black px-3 py-3">
          <div className="absolute inset-x-3 top-3">
            <div className="relative h-8 border-t border-white/10">
              {timelineMarks.map((mark) => (
                <div
                  key={`${mark.label}-${mark.position}`}
                  className="absolute top-0 h-full border-l border-white/20"
                  style={{ left: `${mark.position}%` }}
                >
                  <div className="absolute -top-5 left-0 -translate-x-1/2 text-[10px] text-white/65">
                    {mark.label}
                  </div>
                </div>
              ))}

              {result?.clips.map((clip, index) => {
                const start = new Date(clip.startTime).getTime();
                const end = new Date(clip.endTime).getTime();
                const left =
                  ((start - clipTimelineStart.getTime()) / timelineSpan) * 100;
                const width = Math.max(
                  ((end - start) / timelineSpan) * 100,
                  0.75,
                );
                return (
                  <button
                    key={`${clip.startTime}-${clip.endTime}`}
                    type="button"
                    onClick={() => setSelectedClipIndex(index)}
                    className={cn(
                      "absolute top-3 h-3 rounded-none",
                      clipTone(clip.recordingType, index),
                      index === selectedClipIndex
                        ? "ring-1 ring-white"
                        : "opacity-95",
                    )}
                    style={{
                      left: `${Math.max(0, left)}%`,
                      width: `${width}%`,
                    }}
                  />
                );
              })}

              <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-[#ffe44d]" />
            </div>
          </div>

          <div className="absolute bottom-2 left-3 right-3 flex items-center justify-between text-[10px] text-white/65">
            <div>
              {selectedCamera ? selectedCamera.name : "No camera selected"}
            </div>
            <div>
              {selectedClip
                ? selectedClip.playbackUri
                : "Enter a camera and time to load clips"}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
