"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";

import {
  NVR,
  Site,
  StartOverviewStreamResponse,
  startCCTVOverviewStream,
} from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api-client";
import {
  Building2,
  Fullscreen,
  FullscreenExit,
  Grid3x3,
  Volume2,
  VolumeOff,
} from "@/lib/icons";
import { CCTVTileStream, type StreamProtocol } from "@/app/cctv/views/live";
import { StatusState } from "@/components/shared/status-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";

type OverviewFeedViewProps = {
  sites: Site[];
  nvrs: NVR[];
};

export function OverviewFeedView({ sites, nvrs }: OverviewFeedViewProps) {
  const { toast } = useToast();
  const wallRef = useRef<HTMLDivElement | null>(null);
  const startedRequestKeyRef = useRef("");
  const [selectedSiteId, setSelectedSiteId] = useState("");
  const [selectedNvrId, setSelectedNvrId] = useState("");
  const [preferredProtocol, setPreferredProtocol] = useState<StreamProtocol | null>(null);
  const [streamHint, setStreamHint] = useState<StartOverviewStreamResponse | null>(null);
  const [isMuted, setIsMuted] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const updateProtocol = () => {
      const supportsWebRtc =
        typeof window !== "undefined" &&
        typeof window.RTCPeerConnection !== "undefined";
      setPreferredProtocol(supportsWebRtc ? "WEBRTC" : "HLS");
    };

    updateProtocol();
    window.addEventListener("resize", updateProtocol);
    return () => window.removeEventListener("resize", updateProtocol);
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === wallRef.current);
    };

    handleFullscreenChange();
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);

  const filteredNvrs = useMemo(
    () =>
      nvrs.filter(
        (nvr) => nvr.isActive && (!selectedSiteId || nvr.siteId === selectedSiteId),
      ),
    [nvrs, selectedSiteId],
  );

  const selectedNvr = useMemo(
    () =>
      filteredNvrs.find((nvr) => nvr.id === selectedNvrId) ||
      filteredNvrs.find((nvr) => nvr.isOnline) ||
      filteredNvrs[0] ||
      null,
    [filteredNvrs, selectedNvrId],
  );

  const { mutate: startOverview, isPending: isStartingOverview } = useMutation({
    mutationFn: (nvrId: string) =>
      startCCTVOverviewStream({
        nvrId,
        preferredProtocol: preferredProtocol ?? "WEBRTC",
      }),
    onSuccess: (response) => {
      setStreamHint(response);
    },
    onError: (error) => {
      toast({
        title: "Unable to start overview",
        description: getApiErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    if (!selectedNvr?.id || !preferredProtocol) return;

    const requestKey = `${selectedNvr.id}:${preferredProtocol}`;
    if (
      startedRequestKeyRef.current === requestKey ||
      isStartingOverview
    ) {
      return;
    }

    startedRequestKeyRef.current = requestKey;
    startOverview(selectedNvr.id, {
      onError: () => {
        if (startedRequestKeyRef.current === requestKey) {
          startedRequestKeyRef.current = "";
        }
      },
    });
  }, [
    preferredProtocol,
    selectedNvr?.id,
    isStartingOverview,
    startOverview,
  ]);

  const toggleFullscreen = async () => {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }

    if (wallRef.current?.requestFullscreen) {
      await wallRef.current.requestFullscreen();
    }
  };

  if (nvrs.length === 0) {
    return (
      <StatusState
        variant="empty"
        title="No NVRs configured"
        description="Register an NVR to use the combined feed."
      />
    );
  }

  return (
    <div className="h-[calc(100vh-7rem)]">
      <div className="flex items-center gap-2 border-b border-[var(--edge-subtle)] px-3 py-2">
        <Select
          value={selectedSiteId || "__all__"}
          onValueChange={(value) => {
            setSelectedSiteId(value === "__all__" ? "" : value);
            setSelectedNvrId("");
          }}
        >
          <SelectTrigger className="h-9 w-[220px]">
            <Building2 className="mr-2 h-4 w-4" />
            <SelectValue placeholder="All sites" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All sites</SelectItem>
            {sites.map((site) => (
              <SelectItem key={site.id} value={site.id}>
                {site.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={selectedNvr?.id || "__none__"}
          onValueChange={(value) => setSelectedNvrId(value === "__none__" ? "" : value)}
        >
          <SelectTrigger className="h-9 w-[260px]">
            <SelectValue placeholder="Select recorder" />
          </SelectTrigger>
          <SelectContent>
            {filteredNvrs.map((nvr) => (
              <SelectItem key={nvr.id} value={nvr.id}>
                {nvr.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="ml-auto flex items-center gap-2">
          <Badge variant="outline" className="h-8 rounded-md px-3">
            Combined feed
          </Badge>

          <Button
            type="button"
            variant="secondary"
            size="icon"
            className="h-8 w-8 shadow-none"
            onClick={() => setIsMuted((current) => !current)}
            aria-label={isMuted ? "Unmute" : "Mute"}
            title={isMuted ? "Unmute" : "Mute"}
          >
            {isMuted ? (
              <VolumeOff className="h-4 w-4" />
            ) : (
              <Volume2 className="h-4 w-4" />
            )}
          </Button>

          <Button
            type="button"
            variant="secondary"
            size="icon"
            className="h-8 w-8 shadow-none"
            onClick={() => void toggleFullscreen()}
            aria-label="Toggle full screen"
            title="Full screen"
          >
            {isFullscreen ? (
              <FullscreenExit className="h-4 w-4" />
            ) : (
              <Fullscreen className="h-4 w-4" />
            )}
          </Button>

          <Button asChild variant="secondary" className="h-8 px-2.5 shadow-none">
            <Link href="/cctv/live">
              <Grid3x3 className="mr-1.5 h-4 w-4" />
              <span className="text-xs">Camera wall</span>
            </Link>
          </Button>
        </div>
      </div>

      <div
        ref={wallRef}
        className="relative h-[calc(100%-3.5rem)] overflow-hidden border border-black/10 bg-black"
      >
        {selectedNvr && streamHint?.playUrl ? (
          <CCTVTileStream
            key={`${selectedNvr.id}:${streamHint.playUrl}:${streamHint.fallbackPlayUrl || ""}:${streamHint.snapshotUrl || ""}:${streamHint.protocol}`}
            primaryUrl={streamHint.playUrl}
            fallbackUrl={streamHint.fallbackPlayUrl}
            snapshotUrl={streamHint.snapshotUrl}
            protocol={streamHint.protocol}
            muted={isMuted}
          />
        ) : (
          <div className="absolute inset-0 bg-black" />
        )}

        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-3 bg-gradient-to-b from-black via-black/72 to-transparent px-3 pb-10 pt-3 text-[11px] font-medium text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.65)]">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="truncate tabular-nums">
                {new Date().toLocaleString()}
              </span>
              <Badge
                variant={selectedNvr?.isOnline ? "success" : "danger"}
                className="min-h-4 px-2 py-0 text-[10px] leading-4 shadow-none"
              >
                {selectedNvr?.isOnline ? "Live" : "Offline"}
              </Badge>
            </div>
            <div className="mt-2 truncate text-sm font-semibold text-white">
              {selectedNvr?.name || "Overview"}
            </div>
            <div className="truncate text-xs text-white/68">
              {selectedNvr?.site?.name || "Unknown site"}
            </div>
          </div>

          <div
            className={cn(
              "rounded-md border border-white/10 px-2 py-1 text-xs text-white/72",
              isStartingOverview && "animate-pulse",
            )}
          >
            {isStartingOverview ? "Starting" : "Operations overview"}
          </div>
        </div>
      </div>
    </div>
  );
}
