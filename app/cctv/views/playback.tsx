"use client";

import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";

import { Camera, PlaybackSearchResponse, Site, searchCCTVPlayback } from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api-client";
import { PageIntro } from "@/components/shared/page-intro";
import { StatusState } from "@/components/shared/status-state";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { Clock, Video } from "@/lib/icons";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

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

  return {
    start: toLocalInput(start),
    end: toLocalInput(end),
  };
}

export function PlaybackView({ sites, cameras }: PlaybackViewProps) {
  const defaults = useMemo(() => getDefaultDateTimes(), []);
  const { toast } = useToast();
  const [siteId, setSiteId] = useState<string>("");
  const [cameraId, setCameraId] = useState<string>("");
  const [startTime, setStartTime] = useState<string>(defaults.start);
  const [endTime, setEndTime] = useState<string>(defaults.end);
  const [purpose, setPurpose] = useState<string>("Incident review");
  const [result, setResult] = useState<PlaybackSearchResponse | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const filteredCameras = useMemo(() => {
    return cameras.filter((camera) => (siteId ? camera.siteId === siteId : true));
  }, [cameras, siteId]);

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

  return (
    <div className="space-y-4">
      <PageIntro
        title="Playback Search"
        purpose="Find and open recorded clips by camera and time range."
        nextStep="Pick a site and camera, set a time window, then run search."
      />

      <Card>
        <CardHeader>
          <CardTitle>Search Filters</CardTitle>
          <CardDescription>
            Required fields are marked by context. Use exact times for accurate playback results.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {formError ? (
            <Alert variant="destructive">
              <AlertTitle>Cannot search yet</AlertTitle>
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          ) : null}

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <div className="space-y-2">
              <label className="text-sm font-medium">Site (optional)</label>
              <Select value={siteId} onValueChange={(value) => setSiteId(value === "__all_sites__" ? "" : value)}>
                <SelectTrigger>
                  <SelectValue placeholder="All sites" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all_sites__">All sites</SelectItem>
                  {sites.map((site) => (
                    <SelectItem key={site.id} value={site.id}>
                      {site.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Camera</label>
              <Select value={cameraId} onValueChange={setCameraId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select camera" />
                </SelectTrigger>
                <SelectContent>
                  {filteredCameras.map((camera) => (
                    <SelectItem key={camera.id} value={camera.id}>
                      {camera.site?.name || "Unknown Site"} | {camera.area} | {camera.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Purpose</label>
              <Input
                value={purpose}
                onChange={(event) => setPurpose(event.target.value)}
                placeholder="Incident review"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Start Time</label>
              <Input
                type="datetime-local"
                value={startTime}
                onChange={(event) => setStartTime(event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">End Time</label>
              <Input
                type="datetime-local"
                value={endTime}
                onChange={(event) => setEndTime(event.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" onClick={onSubmit} disabled={playbackSearchMutation.isPending}>
              <Video className="mr-2 h-4 w-4" />
              {playbackSearchMutation.isPending ? "Searching..." : "Search Playback"}
            </Button>
            <p className="text-xs text-muted-foreground">Required: camera, start time, end time.</p>
          </div>
        </CardContent>
      </Card>

      {!result && !playbackSearchMutation.isPending ? (
        <StatusState
          variant="empty"
          title="No playback search started"
          description="Run a playback search to list clips and open their playback URLs."
        />
      ) : null}

      {result ? (
        <Card>
          <CardHeader>
            <CardTitle>Playback Results</CardTitle>
            <CardDescription>
              {result.totalClips} clip(s) found for {result.camera.site.name} | {result.camera.area} |{" "}
              {result.camera.name}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {result.clips.length === 0 ? (
              <StatusState
                variant="empty"
                title="No clips in this range"
                description="Expand the time range or verify that the camera was recording."
              />
            ) : (
              <div className="overflow-x-auto">
                <Table className="w-full text-sm">
                  <TableHeader className="bg-muted">
                    <TableRow>
                      <TableHead className="p-3 text-left font-semibold">Start</TableHead>
                      <TableHead className="p-3 text-left font-semibold">End</TableHead>
                      <TableHead className="p-3 text-left font-semibold">Duration</TableHead>
                      <TableHead className="p-3 text-left font-semibold">Size (MB)</TableHead>
                      <TableHead className="p-3 text-left font-semibold">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {result.clips.map((clip) => (
                      <TableRow key={`${clip.startTime}-${clip.endTime}`} className="border-b">
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
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => window.open(clip.playbackUri, "_blank", "noopener,noreferrer")}
                          >
                            Open URI
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}


