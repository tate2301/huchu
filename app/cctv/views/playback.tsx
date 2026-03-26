"use client";

import { useMemo, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";

import { Camera, PlaybackSearchResponse, Site, searchCCTVPlayback } from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api-client";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ExportMenu } from "@/components/ui/export-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusState } from "@/components/shared/status-state";
import { useToast } from "@/components/ui/use-toast";
import { CCTVMetricStrip, CCTVSection, CCTVToolbar } from "@/components/cctv/cctv-panel";
import { Badge } from "@/components/ui/badge";
import { Clock, ChevronRight, FileText, Video } from "@/lib/icons";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { type DocumentExportFormat } from "@/lib/documents/export-client";
import { exportElementToDocument } from "@/lib/pdf";
import { cn } from "@/lib/utils";

type PlaybackViewProps = {
  sites: Site[];
  cameras: Camera[];
};

function getDefaultDateTimes() {
  const end = new Date();
  const start = new Date(end.getTime() - 60 * 60 * 1000);
  const toLocalInput = (value: Date) => {
    const timezoneOffset = value.getTimezoneOffset();
    const localDate = new Date(value.getTime() - timezoneOffset * 60_000);
    return localDate.toISOString().slice(0, 16);
  };
  return { start: toLocalInput(start), end: toLocalInput(end) };
}

export function PlaybackView({ sites, cameras }: PlaybackViewProps) {
  const exportRef = useRef<HTMLDivElement | null>(null);
  const defaults = useMemo(() => getDefaultDateTimes(), []);
  const { toast } = useToast();
  const [siteId, setSiteId] = useState<string>("");
  const [cameraId, setCameraId] = useState<string>("");
  const [startTime, setStartTime] = useState<string>(defaults.start);
  const [endTime, setEndTime] = useState<string>(defaults.end);
  const [purpose, setPurpose] = useState<string>("Incident review");
  const [result, setResult] = useState<PlaybackSearchResponse | null>(null);
  const [selectedClipIndex, setSelectedClipIndex] = useState<number>(0);
  const [formError, setFormError] = useState<string | null>(null);
  const [copiedClipUri, setCopiedClipUri] = useState<string | null>(null);

  const filteredCameras = useMemo(() => cameras.filter((camera) => (siteId ? camera.siteId === siteId : true)), [cameras, siteId]);

  const selectedCamera = useMemo(
    () => cameras.find((camera) => camera.id === cameraId) ?? null,
    [cameraId, cameras],
  );

  const selectedClip = useMemo(() => result?.clips[selectedClipIndex] ?? result?.clips[0] ?? null, [result, selectedClipIndex]);

  useEffect(() => {
    if (!copiedClipUri) return;
    const timeout = window.setTimeout(() => setCopiedClipUri(null), 1800);
    return () => window.clearTimeout(timeout);
  }, [copiedClipUri]);

  const playbackSearchMutation = useMutation({
    mutationFn: (input: { cameraId: string; startTime: string; endTime: string; purpose?: string; page?: number; limit?: number }) => searchCCTVPlayback(input),
    onSuccess: (data) => {
      setResult(data);
      setSelectedClipIndex(0);
      toast({ title: "Playback results ready", description: `Found ${data.totalClips} clip(s) for the selected period.` });
    },
    onError: (error) => {
      toast({ title: "Playback search failed", description: getApiErrorMessage(error), variant: "destructive" });
    },
  });

  const onSubmit = () => {
    setFormError(null);
    if (!cameraId) {
      setFormError("Select a camera before searching.");
      return;
    }
    if (!startTime || !endTime) {
      setFormError("Start and end time are required.");
      return;
    }
    const start = new Date(startTime);
    const end = new Date(endTime);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start >= end) {
      setFormError("Start time must be before end time.");
      return;
    }
    playbackSearchMutation.mutate({
      cameraId,
      startTime: new Date(startTime).toISOString(),
      endTime: new Date(endTime).toISOString(),
      purpose: purpose.trim() || "Playback review",
      limit: 50,
      page: 1,
    });
  };

  const clipCount = result?.clips.length ?? 0;
  const totalMinutes = result?.clips.reduce((sum, clip) => sum + clip.duration / 60, 0) ?? 0;
  const selectedClipLabel = selectedClip ? `${selectedClipIndex + 1}/${clipCount}` : "No clip selected";
  const activeSiteName = sites.find((site) => site.id === siteId)?.name || "All sites";

  const copyClipUri = async () => {
    if (!selectedClip) return;
    await navigator.clipboard.writeText(selectedClip.playbackUri);
    setCopiedClipUri(selectedClip.playbackUri);
    toast({ title: "Playback URI copied", description: "The clip link is on your clipboard." });
  };

  return (
    <div className="space-y-5">
      <section className="rounded-3xl border border-[var(--edge-default)] bg-[linear-gradient(135deg,var(--surface-base)_0%,var(--surface-muted)_100%)] p-5 shadow-[var(--surface-frame-shadow)] sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">CCTV / Playback</p>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">Playback Search</h1>
            <p className="max-w-3xl text-sm text-muted-foreground">
              Find recorded clips by camera and exact time range, then move through the evidence like a timeline instead of a plain table.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" onClick={onSubmit} disabled={playbackSearchMutation.isPending}>
              <Video className="mr-2 h-4 w-4" />
              {playbackSearchMutation.isPending ? "Searching..." : "Search Playback"}
            </Button>
          </div>
        </div>

        <div className="mt-5">
          <CCTVMetricStrip
            stats={[
              { label: "Clips found", value: clipCount, detail: result ? `${result.totalClips} total results` : "Run a search to load clips" },
              { label: "Duration", value: `${Math.max(0, Math.round(totalMinutes))} min`, detail: "Combined clip duration", tone: clipCount > 0 ? "success" : "default" },
              { label: "Selected camera", value: selectedCamera ? selectedCamera.name : "None", detail: selectedCamera ? `${selectedCamera.site?.name || "Unknown Site"} | ${selectedCamera.area}` : "Pick a camera to start" },
              { label: "Time window", value: startTime && endTime ? "Set" : "Unset", detail: startTime && endTime ? `${startTime.replace("T", " ")} to ${endTime.replace("T", " ")}` : "Choose start and end" },
            ]}
          />
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_380px]">
        <div className="space-y-4">
          <CCTVSection
            eyebrow="evidence preview"
            title={selectedClip ? `Selected clip ${selectedClipLabel}` : "Clip preview"}
            description={
              selectedClip
                ? `${result?.camera.site.name || "Unknown Site"} | ${result?.camera.area || "Unknown area"} | ${result?.camera.name || "Unknown camera"}`
                : "Run a search and choose a clip to inspect its playback window and details."
            }
            actions={
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" variant="outline" onClick={() => setSelectedClipIndex((prev) => Math.max(0, prev - 1))} disabled={!result || selectedClipIndex === 0}>
                  Previous
                </Button>
                <Button type="button" variant="outline" onClick={() => setSelectedClipIndex((prev) => Math.min((result?.clips.length || 1) - 1, prev + 1))} disabled={!result || selectedClipIndex >= (result?.clips.length || 0) - 1}>
                  Next
                </Button>
              </div>
            }
          >
            <div className="px-4 pb-4 sm:px-5">
              {selectedClip ? (
                <div className="space-y-4 rounded-2xl border border-[var(--edge-default)] bg-[linear-gradient(180deg,var(--surface-base)_0%,var(--surface-muted)_100%)] p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        {new Date(selectedClip.startTime).toLocaleString()} - {new Date(selectedClip.endTime).toLocaleString()}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Duration {Math.max(1, Math.round(selectedClip.duration / 60))} min | Size {selectedClip.fileSize} MB
                      </p>
                    </div>
                    <Badge variant="secondary" className="rounded-full">Preview ready</Badge>
                  </div>

                  <div className="flex min-h-56 items-center justify-center rounded-2xl border border-dashed border-[var(--edge-default)] bg-[var(--surface-base)] p-6 text-center">
                    <div className="space-y-3">
                      <div className="flex items-center justify-center gap-2 text-sm font-medium text-foreground">
                        <Video className="h-4 w-4 text-[var(--status-success-text)]" />
                        Investigation clip selected
                      </div>
                      <p className="max-w-md text-xs text-muted-foreground">
                        Use the playback URI or open the clip in a new tab. The preview area is intentionally quiet so the timeline and evidence details stay easy to scan.
                      </p>
                      <div className="flex flex-wrap justify-center gap-2">
                        <Button asChild size="sm" variant="outline">
                          <a href={selectedClip.playbackUri} target="_blank" rel="noreferrer">Open URI</a>
                        </Button>
                        <Button type="button" size="sm" variant="outline" onClick={copyClipUri}>
                          Copy URI
                        </Button>
                      </div>
                      {copiedClipUri ? <p className="text-[10px] text-[var(--status-success-text)]">Copied to clipboard.</p> : null}
                    </div>
                  </div>
                </div>
              ) : (
                <StatusState variant="empty" title="No clip selected" description="Run a playback search and click a row to inspect the clip." />
              )}
            </div>
          </CCTVSection>

          <CCTVSection
            eyebrow="timeline"
            title="Clip timeline"
            description="Click a row to inspect a clip and move through the evidence in order."
            actions={
              <ExportMenu
                variant="outline"
                size="sm"
                disabled={clipCount === 0}
                onExport={(format: DocumentExportFormat) => {
                  if (!exportRef.current) return;
                  return exportElementToDocument(exportRef.current, `cctv-playback-${new Date().toISOString().slice(0, 10)}.${format}`, format);
                }}
              />
            }
          >
            <div ref={exportRef} className="px-4 pb-4 sm:px-5">
              {result && result.clips.length > 0 ? (
                <div className="overflow-hidden rounded-2xl border border-[var(--edge-default)]">
                  <Table className="w-full text-sm">
                    <TableHeader className="bg-[var(--surface-muted)]">
                      <TableRow>
                        <TableHead className="p-3 text-left font-semibold">Start</TableHead>
                        <TableHead className="p-3 text-left font-semibold">End</TableHead>
                        <TableHead className="p-3 text-left font-semibold">Duration</TableHead>
                        <TableHead className="p-3 text-left font-semibold">Size (MB)</TableHead>
                        <TableHead className="p-3 text-left font-semibold">URI</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {result.clips.map((clip, index) => {
                        const isActive = index === selectedClipIndex;
                        return (
                          <TableRow
                            key={`${clip.startTime}-${clip.endTime}`}
                            className={cn("cursor-pointer border-b transition-colors hover:bg-[var(--surface-muted)]", isActive ? "bg-[var(--surface-muted)]" : "")}
                            onClick={() => setSelectedClipIndex(index)}
                          >
                            <TableCell className="p-3">{new Date(clip.startTime).toLocaleString()}</TableCell>
                            <TableCell className="p-3">{new Date(clip.endTime).toLocaleString()}</TableCell>
                            <TableCell className="p-3">
                              <div className="flex items-center gap-1">
                                <Clock className="h-3 w-3 text-muted-foreground" />
                                <span>{Math.max(1, Math.round(clip.duration / 60))} min</span>
                              </div>
                            </TableCell>
                            <TableCell className="p-3">{clip.fileSize}</TableCell>
                            <TableCell className="p-3">
                              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                <FileText className="h-3 w-3" />
                                {clip.playbackUri}
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              ) : result ? (
                <StatusState variant="empty" title="No clips in this range" description="Expand the time range or verify that the camera was recording." />
              ) : (
                <StatusState variant="empty" title="No playback search started" description="Run a playback search to list clips and open their playback URLs." />
              )}
            </div>
          </CCTVSection>
        </div>

        <aside className="space-y-4">
          <CCTVSection eyebrow="search" title="Playback search" description="Pick a site and camera, then set an exact time window for the investigation.">
            <div className="space-y-4 px-4 pb-4 sm:px-5">
              {formError ? (
                <Alert variant="destructive">
                  <AlertTitle>Cannot search yet</AlertTitle>
                  <AlertDescription>{formError}</AlertDescription>
                </Alert>
              ) : null}

              <CCTVToolbar>
                <div className="flex min-w-[210px] flex-1 flex-col gap-2">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Site</div>
                  <Select value={siteId} onValueChange={(value) => setSiteId(value === "__all_sites__" ? "" : value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="All sites" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all_sites__">All sites</SelectItem>
                      {sites.map((site) => (
                        <SelectItem key={site.id} value={site.id}>{site.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CCTVToolbar>

              <div className="space-y-2">
                <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Camera</div>
                <Select value={cameraId} onValueChange={setCameraId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select camera" />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredCameras.map((camera) => (
                      <SelectItem key={camera.id} value={camera.id}>{camera.site?.name || "Unknown Site"} | {camera.area} | {camera.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Start time</div>
                  <Input type="datetime-local" value={startTime} onChange={(event) => setStartTime(event.target.value)} />
                </div>
                <div className="space-y-2">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">End time</div>
                  <Input type="datetime-local" value={endTime} onChange={(event) => setEndTime(event.target.value)} />
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Purpose</div>
                <Input value={purpose} onChange={(event) => setPurpose(event.target.value)} placeholder="Incident review" />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" onClick={onSubmit} disabled={playbackSearchMutation.isPending}>
                  <Video className="mr-2 h-4 w-4" />
                  {playbackSearchMutation.isPending ? "Searching..." : "Search Playback"}
                </Button>
                <Button type="button" variant="outline" onClick={() => {
                  setSiteId("");
                  setCameraId("");
                  setPurpose("Incident review");
                  setStartTime(defaults.start);
                  setEndTime(defaults.end);
                  setFormError(null);
                }}>
                  Reset
                </Button>
              </div>
            </div>
          </CCTVSection>

          <CCTVSection eyebrow="clip details" title={selectedClip ? "Investigation details" : "No clip selected"} description={selectedClip ? `${activeSiteName} | ${selectedCamera?.area || "Unknown area"}` : "Select a result row after search to inspect the clip details."}>
            <div className="space-y-3 px-4 pb-4 sm:px-5">
              {selectedClip ? (
                <>
                  <div className="grid gap-2 text-sm">
                    <div className="flex items-center justify-between gap-3"><span className="text-muted-foreground">Clip window</span><span className="font-medium">{new Date(selectedClip.startTime).toLocaleString()}</span></div>
                    <div className="flex items-center justify-between gap-3"><span className="text-muted-foreground">End time</span><span className="font-medium">{new Date(selectedClip.endTime).toLocaleString()}</span></div>
                    <div className="flex items-center justify-between gap-3"><span className="text-muted-foreground">Duration</span><span className="font-medium">{Math.max(1, Math.round(selectedClip.duration / 60))} min</span></div>
                    <div className="flex items-center justify-between gap-3"><span className="text-muted-foreground">Size</span><span className="font-medium">{selectedClip.fileSize} MB</span></div>
                  </div>

                  <div className="rounded-2xl border border-[var(--edge-default)] bg-[var(--surface-muted)]/60 p-3 text-xs text-muted-foreground">
                    <div className="flex items-center gap-2 text-foreground">
                      <ChevronRight className="h-4 w-4" />
                      Playback URI
                    </div>
                    <p className="mt-2 break-all">{selectedClip.playbackUri}</p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button asChild size="sm" variant="outline"><a href={selectedClip.playbackUri} target="_blank" rel="noreferrer">Open URI</a></Button>
                    <Button type="button" size="sm" variant="outline" onClick={copyClipUri}>Copy URI</Button>
                  </div>

                  {copiedClipUri ? <p className="text-[10px] text-[var(--status-success-text)]">Copied to clipboard.</p> : null}
                </>
              ) : (
                <StatusState variant="empty" title="No clip selected" description="Run a search, then choose a clip from the timeline to inspect evidence details." />
              )}
            </div>
          </CCTVSection>
        </aside>
      </div>
    </div>
  );
}
