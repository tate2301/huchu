"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { CheckCircle, Mic, Pencil, Radio, Shield, Trash2, XCircle } from "@/lib/icons";
import { fetchCameras, Site } from "@/lib/api";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { type DocumentExportFormat } from "@/lib/documents/export-client";
import { exportElementToDocument } from "@/lib/pdf";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExportMenu } from "@/components/ui/export-menu";
import { Input } from "@/components/ui/input";
import { PdfTemplate } from "@/components/pdf/pdf-template";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusState } from "@/components/shared/status-state";
import { PageIntro } from "@/components/shared/page-intro";
import { CCTVSection, CCTVStat, CCTVSurface } from "@/components/cctv/cctv-surfaces";
import { useToast } from "@/components/ui/use-toast";

interface CamerasViewProps {
  sites: Site[];
  selectedSiteId: string;
  onSiteChange: (siteId: string) => void;
  createdId?: string | null;
}

function formatLastSeen(value?: string | null) {
  return value ? new Date(value).toLocaleString() : "No recent signal";
}

export function CamerasView({ sites, selectedSiteId, onSiteChange, createdId }: CamerasViewProps) {
  const camerasPdfRef = useRef<HTMLDivElement | null>(null);
  const [areaFilter, setAreaFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [selectedCameraId, setSelectedCameraId] = useState<string>("");
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const siteFilterId = "cctv-cameras-site-filter";
  const areaFilterId = "cctv-cameras-area-filter";
  const statusFilterId = "cctv-cameras-status-filter";

  const { data, isLoading, error } = useQuery({
    queryKey: ["cameras", selectedSiteId, areaFilter, statusFilter],
    queryFn: () =>
      fetchCameras({
        siteId: selectedSiteId || undefined,
        area: areaFilter || undefined,
        isOnline: statusFilter === "online" ? true : statusFilter === "offline" ? false : undefined,
        limit: 100,
      }),
  });

  const cameras = useMemo(() => data?.data ?? [], [data?.data]);
  const activeSiteName = sites.find((site) => site.id === selectedSiteId)?.name || "All Sites";
  const onlineCount = cameras.filter((camera) => camera.isOnline).length;
  const offlineCount = cameras.filter((camera) => !camera.isOnline).length;
  const highSecurityCount = cameras.filter((camera) => camera.isHighSecurity).length;
  const recordingCount = cameras.filter((camera) => camera.isRecording).length;
  const exportDisabled = isLoading || cameras.length === 0;

  const filteredCameras = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return cameras;

    return cameras.filter((camera) => {
      const haystack = [
        camera.name,
        camera.area,
        camera.site?.name,
        camera.nvr?.name,
        camera.nvr?.ipAddress,
        String(camera.channelNumber),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(query);
    });
  }, [cameras, searchTerm]);

  const selectedCamera = useMemo(() => {
    if (!filteredCameras.length) return null;

    const selected =
      filteredCameras.find((camera) => camera.id === selectedCameraId) ||
      filteredCameras.find((camera) => camera.id === createdId) ||
      filteredCameras[0] ||
      null;

    return selected;
  }, [createdId, filteredCameras, selectedCameraId]);

  const areas = Array.from(
    new Set(cameras.map((camera) => camera.area).filter((area) => area && area.trim())),
  ).sort();

  const deactivateMutation = useMutation({
    mutationFn: async (cameraId: string) =>
      fetchJson(`/api/cctv/cameras/${cameraId}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cameras"] });
      toast({
        title: "Camera deactivated",
        description: "The camera has been removed from active monitoring.",
      });
    },
    onError: (error: unknown) => {
      toast({
        title: "Unable to deactivate camera",
        description: getApiErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  const clearFilters = () => {
    onSiteChange("");
    setAreaFilter("");
    setStatusFilter("");
    setSearchTerm("");
  };

  if (error) {
    return (
      <StatusState
        variant="error"
        title="Unable to load cameras"
        description={getApiErrorMessage(error)}
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageIntro
        title="Cameras"
        purpose="Browse registered cameras, check health, and maintain site assignments."
        nextStep="Filter by site or area, then edit or deactivate what needs attention."
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

      {isLoading ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {[1, 2, 3, 4].map((index) => (
            <div key={index} className="rounded-2xl border border-border/80 p-4">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="mt-3 h-8 w-16" />
              <Skeleton className="mt-2 h-4 w-32" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <CCTVStat
            label="Cameras"
            value={String(cameras.length)}
            detail={`${activeSiteName} scope`}
          />
          <CCTVStat
            label="Online"
            value={String(onlineCount)}
            detail={`${offlineCount} offline`}
            tone={offlineCount > 0 ? "warn" : "good"}
          />
          <CCTVStat
            label="Recording"
            value={String(recordingCount)}
            detail="Active recording feeds"
            tone={recordingCount > 0 ? "good" : "neutral"}
          />
          <CCTVStat
            label="High Security"
            value={String(highSecurityCount)}
            detail="Restricted cameras"
            tone={highSecurityCount > 0 ? "warn" : "neutral"}
          />
        </div>
      )}

      <CCTVSurface className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Filters
            </h2>
            <p className="text-sm text-muted-foreground">
              Search across camera names, areas, sites, and recorder assignments.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ExportMenu
              variant="outline"
              size="sm"
              disabled={exportDisabled}
              onExport={(format: DocumentExportFormat) => {
                if (!camerasPdfRef.current) return;
                return exportElementToDocument(
                  camerasPdfRef.current,
                  `cctv-cameras-${selectedSiteId || "all-sites"}.${format}`,
                  format,
                );
              }}
            />
            {(selectedSiteId || areaFilter || statusFilter || searchTerm) && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                Clear filters
              </Button>
            )}
          </div>
        </div>

        <div className="mt-4 grid gap-3 xl:grid-cols-[1.2fr_0.8fr_0.8fr_0.8fr]">
          <div className="space-y-2 xl:col-span-1">
            <label className="text-sm font-medium">Search</label>
            <Input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search camera, site, area, or NVR"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor={siteFilterId}>
              Site
            </label>
            <Select
              value={selectedSiteId}
              onValueChange={(value) => onSiteChange(value === "__all_sites__" ? "" : value)}
            >
              <SelectTrigger id={siteFilterId}>
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
            <label className="text-sm font-medium" htmlFor={areaFilterId}>
              Area
            </label>
            <Select
              value={areaFilter}
              onValueChange={(value) => setAreaFilter(value === "__all_areas__" ? "" : value)}
            >
              <SelectTrigger id={areaFilterId}>
                <SelectValue placeholder="All areas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all_areas__">All areas</SelectItem>
                {areas.map((area) => (
                  <SelectItem key={area} value={area}>
                    {area}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor={statusFilterId}>
              Status
            </label>
            <Select
              value={statusFilter}
              onValueChange={(value) => setStatusFilter(value === "__all_status__" ? "" : value)}
            >
              <SelectTrigger id={statusFilterId}>
                <SelectValue placeholder="Any status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all_status__">Any status</SelectItem>
                <SelectItem value="online">Online</SelectItem>
                <SelectItem value="offline">Offline</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CCTVSurface>

      {!isLoading && cameras.length > 0 && offlineCount === 0 ? (
        <Alert variant="success">
          <AlertTitle>All cameras online</AlertTitle>
          <AlertDescription>Every listed camera is currently reachable.</AlertDescription>
        </Alert>
      ) : null}

      {isLoading ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-3 rounded-2xl border border-border/80 p-4">
            {[1, 2, 3, 4, 5].map((index) => (
              <div key={index} className="grid gap-3 border-b border-border/60 py-4 md:grid-cols-[1.8fr_1fr_1fr]">
                <Skeleton className="h-5 w-48" />
                <Skeleton className="h-5 w-28" />
                <Skeleton className="h-5 w-24" />
              </div>
            ))}
          </div>
          <div className="rounded-2xl border border-border/80 p-4">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="mt-4 h-32 w-full" />
            <Skeleton className="mt-4 h-5 w-32" />
            <Skeleton className="mt-2 h-5 w-full" />
            <Skeleton className="mt-2 h-5 w-5/6" />
          </div>
        </div>
      ) : filteredCameras.length === 0 ? (
        <StatusState
          variant="empty"
          title="No cameras match the current filters"
          description="Widen the search or clear the filters to see more cameras."
        />
      ) : (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
          <CCTVSection
            title="Camera register"
            description={`${filteredCameras.length} camera${filteredCameras.length === 1 ? "" : "s"} in the current view.`}
          >
            <CCTVSurface className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[960px] text-sm">
                  <thead className="border-b border-border/70 bg-muted/40 text-left text-xs uppercase tracking-[0.16em] text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3 font-medium">Camera</th>
                      <th className="px-4 py-3 font-medium">Site / Area</th>
                      <th className="px-4 py-3 font-medium">Recorder</th>
                      <th className="px-4 py-3 font-medium">State</th>
                      <th className="px-4 py-3 font-medium">Last seen</th>
                      <th className="px-4 py-3 font-medium text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCameras.map((camera) => {
                      const isSelected = selectedCamera?.id === camera.id;
                      return (
                        <tr
                          key={camera.id}
                          className={[
                            "border-b border-border/60 transition-colors hover:bg-muted/40",
                            isSelected ? "bg-muted/50" : "",
                            createdId === camera.id ? "bg-emerald-50/60" : "",
                          ].join(" ")}
                          onClick={() => setSelectedCameraId(camera.id)}
                        >
                          <td className="px-4 py-4">
                            <div className="flex items-start gap-3">
                              <div
                                className={[
                                  "mt-0.5 h-2.5 w-2.5 rounded-full",
                                  camera.isOnline ? "bg-emerald-500" : "bg-rose-500",
                                ].join(" ")}
                              />
                              <div className="space-y-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="font-semibold text-foreground">{camera.name}</span>
                                  {camera.isHighSecurity ? (
                                    <Badge variant="outline" className="gap-1">
                                      <Shield className="h-3 w-3" />
                                      High security
                                    </Badge>
                                  ) : null}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  Channel {camera.channelNumber}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            <div className="space-y-1">
                              <div className="font-medium">{camera.site?.name || "Unknown site"}</div>
                              <div className="text-xs text-muted-foreground">{camera.area}</div>
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            <div className="space-y-1">
                              <div className="font-medium">{camera.nvr?.name || "Unknown NVR"}</div>
                              <div className="text-xs text-muted-foreground">
                                {camera.nvr?.ipAddress || "No address"}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            <div className="flex flex-wrap gap-2">
                              <Badge variant={camera.isOnline ? "outline" : "destructive"}>
                                {camera.isOnline ? (
                                  <CheckCircle className="mr-1 h-3 w-3" />
                                ) : (
                                  <XCircle className="mr-1 h-3 w-3" />
                                )}
                                {camera.isOnline ? "Online" : "Offline"}
                              </Badge>
                              <Badge variant={camera.isRecording ? "secondary" : "outline"}>
                                <Radio className="mr-1 h-3 w-3" />
                                {camera.isRecording ? "Recording" : "Idle"}
                              </Badge>
                              {camera.hasAudio ? (
                                <Badge variant="secondary">
                                  <Mic className="mr-1 h-3 w-3" />
                                  Audio
                                </Badge>
                              ) : null}
                            </div>
                          </td>
                          <td className="px-4 py-4 text-xs text-muted-foreground">
                            {formatLastSeen(camera.lastSeen)}
                          </td>
                          <td className="px-4 py-4">
                            <div className="flex justify-end gap-2">
                              <Button asChild size="sm" variant="outline" onClick={(event) => event.stopPropagation()}>
                                <Link href={`/cctv/cameras/${camera.id}/edit`}>
                                  <Pencil className="mr-1 h-3 w-3" />
                                  Edit
                                </Link>
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  deactivateMutation.mutate(camera.id);
                                }}
                                disabled={deactivateMutation.isPending}
                              >
                                <Trash2 className="mr-1 h-3 w-3" />
                                Deactivate
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CCTVSurface>
          </CCTVSection>

          <CCTVSection title="Camera details" description="Selection summary and quick maintenance actions.">
            <CCTVSurface className="p-4">
              {selectedCamera ? (
                <div className="space-y-5">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-semibold">{selectedCamera.name}</h3>
                      {selectedCamera.isHighSecurity ? (
                        <Badge variant="outline">Restricted</Badge>
                      ) : null}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {selectedCamera.site?.name || "Unknown site"} | {selectedCamera.area}
                    </p>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
                      <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Recorder</div>
                      <div className="mt-1 font-medium">{selectedCamera.nvr?.name || "Unknown NVR"}</div>
                      <div className="text-sm text-muted-foreground">{selectedCamera.nvr?.ipAddress || "No address"}</div>
                    </div>
                    <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
                      <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Channel</div>
                      <div className="mt-1 font-medium tabular-nums">{selectedCamera.channelNumber}</div>
                      <div className="text-sm text-muted-foreground">
                        {selectedCamera.isRecording ? "Recording active" : "Recording idle"}
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-3">
                    <div className="flex items-center justify-between border-b border-border/60 pb-2 text-sm">
                      <span className="text-muted-foreground">Status</span>
                      <Badge variant={selectedCamera.isOnline ? "outline" : "destructive"}>
                        {selectedCamera.isOnline ? "Online" : "Offline"}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between border-b border-border/60 pb-2 text-sm">
                      <span className="text-muted-foreground">Last seen</span>
                      <span>{formatLastSeen(selectedCamera.lastSeen)}</span>
                    </div>
                    <div className="flex items-center justify-between border-b border-border/60 pb-2 text-sm">
                      <span className="text-muted-foreground">Audio</span>
                      <span>{selectedCamera.hasAudio ? "Enabled" : "Disabled"}</span>
                    </div>
                    <div className="flex items-center justify-between border-b border-border/60 pb-2 text-sm">
                      <span className="text-muted-foreground">Motion detection</span>
                      <span>{selectedCamera.hasMotionDetect ? "Enabled" : "Disabled"}</span>
                    </div>
                    {selectedCamera.description ? (
                      <div className="space-y-1 border-b border-border/60 pb-2 text-sm">
                        <div className="text-muted-foreground">Description</div>
                        <p>{selectedCamera.description}</p>
                      </div>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button asChild variant="outline">
                      <Link href={`/cctv/cameras/${selectedCamera.id}/edit`}>
                        <Pencil className="mr-2 h-4 w-4" />
                        Edit camera
                      </Link>
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => deactivateMutation.mutate(selectedCamera.id)}
                      disabled={deactivateMutation.isPending}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Deactivate
                    </Button>
                  </div>
                </div>
              ) : (
                <StatusState
                  variant="empty"
                  title="No camera selected"
                  description="Choose a camera from the register to inspect its details."
                />
              )}
            </CCTVSurface>
          </CCTVSection>
        </div>
      )}

      <div className="absolute left-[-9999px] top-0">
        <div ref={camerasPdfRef}>
          <PdfTemplate
            title="CCTV Cameras"
            subtitle={`${activeSiteName} | ${areaFilter || "All areas"} | ${statusFilter || "All statuses"}`}
            meta={[
              { label: "Site", value: activeSiteName },
              { label: "Total cameras", value: String(cameras.length) },
              { label: "Online", value: String(onlineCount) },
              { label: "Offline", value: String(offlineCount) },
            ]}
          >
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-200 text-left">
                  <th className="py-2">Camera</th>
                  <th className="py-2">Area</th>
                  <th className="py-2">Site</th>
                  <th className="py-2">NVR</th>
                  <th className="py-2">Status</th>
                  <th className="py-2">Recording</th>
                </tr>
              </thead>
              <tbody>
                {filteredCameras.map((camera) => (
                  <tr key={camera.id} className="border-b border-gray-100">
                    <td className="py-2">
                      <div className="font-semibold">{camera.name}</div>
                      <div className="text-[10px] text-gray-500">Channel {camera.channelNumber}</div>
                    </td>
                    <td className="py-2">{camera.area}</td>
                    <td className="py-2">{camera.site?.name || "Unknown"}</td>
                    <td className="py-2">{camera.nvr?.name || "Unknown"}</td>
                    <td className="py-2">{camera.isOnline ? "Online" : "Offline"}</td>
                    <td className="py-2">{camera.isRecording ? "Active" : "Inactive"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </PdfTemplate>
        </div>
      </div>
    </div>
  );
}
