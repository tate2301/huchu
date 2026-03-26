"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { CheckCircle, Pencil, Trash2, XCircle } from "@/lib/icons";
import { fetchNVRs, Site } from "@/lib/api";
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

interface NVRsViewProps {
  sites: Site[];
  selectedSiteId: string;
  onSiteChange: (siteId: string) => void;
  createdId?: string | null;
}

function formatHeartbeat(value?: string | null) {
  return value ? new Date(value).toLocaleString() : "No recent check";
}

export function NVRsView({ sites, selectedSiteId, onSiteChange, createdId }: NVRsViewProps) {
  const nvrsPdfRef = useRef<HTMLDivElement | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [selectedNvrId, setSelectedNvrId] = useState<string>("");
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const siteFilterId = "cctv-nvrs-site-filter";
  const statusFilterId = "cctv-nvrs-status-filter";

  const { data, isLoading, error } = useQuery({
    queryKey: ["nvrs", selectedSiteId, statusFilter],
    queryFn: () =>
      fetchNVRs({
        siteId: selectedSiteId || undefined,
        isOnline: statusFilter === "online" ? true : statusFilter === "offline" ? false : undefined,
      }),
  });

  const nvrs = useMemo(() => data?.data ?? [], [data?.data]);
  const activeSiteName = sites.find((site) => site.id === selectedSiteId)?.name || "All Sites";
  const onlineCount = nvrs.filter((nvr) => nvr.isOnline).length;
  const offlineCount = nvrs.filter((nvr) => !nvr.isOnline).length;
  const cameraCount = nvrs.reduce((count, nvr) => count + (nvr._count?.cameras || 0), 0);
  const exportDisabled = isLoading || nvrs.length === 0;

  const filteredNvrs = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return nvrs;

    return nvrs.filter((nvr) => {
      const haystack = [
        nvr.name,
        nvr.site?.name,
        nvr.manufacturer,
        nvr.model,
        nvr.firmware,
        nvr.ipAddress,
        nvr.port,
        nvr.httpPort,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(query);
    });
  }, [nvrs, searchTerm]);

  const selectedNvr = useMemo(() => {
    if (!filteredNvrs.length) return null;

    const selected =
      filteredNvrs.find((nvr) => nvr.id === selectedNvrId) ||
      filteredNvrs.find((nvr) => nvr.id === createdId) ||
      filteredNvrs[0] ||
      null;

    return selected;
  }, [createdId, filteredNvrs, selectedNvrId]);

  const deactivateMutation = useMutation({
    mutationFn: async (nvrId: string) =>
      fetchJson(`/api/cctv/nvrs/${nvrId}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["nvrs"] });
      toast({
        title: "NVR deactivated",
        description: "The recorder has been removed from active use.",
      });
    },
    onError: (error: unknown) => {
      toast({
        title: "Unable to deactivate NVR",
        description: getApiErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  const clearFilters = () => {
    onSiteChange("");
    setStatusFilter("");
    setSearchTerm("");
  };

  if (error) {
    return (
      <StatusState
        variant="error"
        title="Unable to load NVRs"
        description={getApiErrorMessage(error)}
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageIntro
        title="NVRs"
        purpose="Manage recorders, confirm network readiness, and keep camera assignments healthy."
        nextStep="Filter recorders, inspect the selected device, then edit or deactivate as needed."
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/cctv/nvrs/new">Register NVR</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/cctv/cameras/new">Register Camera</Link>
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
          <CCTVStat label="NVRs" value={String(nvrs.length)} detail={`${activeSiteName} scope`} />
          <CCTVStat
            label="Online"
            value={String(onlineCount)}
            detail={`${offlineCount} offline`}
            tone={offlineCount > 0 ? "warn" : "good"}
          />
          <CCTVStat label="Cameras" value={String(cameraCount)} detail="Linked channels" tone="neutral" />
          <CCTVStat
            label="Offline"
            value={String(offlineCount)}
            detail="Needs attention"
            tone={offlineCount > 0 ? "danger" : "good"}
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
              Search by name, IP address, manufacturer, or connected site.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ExportMenu
              variant="outline"
              size="sm"
              disabled={exportDisabled}
              onExport={(format: DocumentExportFormat) => {
                if (!nvrsPdfRef.current) return;
                return exportElementToDocument(
                  nvrsPdfRef.current,
                  `cctv-nvrs-${selectedSiteId || "all-sites"}.${format}`,
                  format,
                );
              }}
            />
            {(selectedSiteId || statusFilter || searchTerm) && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                Clear filters
              </Button>
            )}
          </div>
        </div>

        <div className="mt-4 grid gap-3 xl:grid-cols-[1.2fr_0.8fr_0.8fr]">
          <div className="space-y-2 xl:col-span-1">
            <label className="text-sm font-medium">Search</label>
            <Input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search recorder, IP, model, or manufacturer"
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

      {!isLoading && nvrs.length > 0 && offlineCount === 0 ? (
        <Alert variant="success">
          <AlertTitle>All NVRs online</AlertTitle>
          <AlertDescription>All listed recorders are connected and healthy.</AlertDescription>
        </Alert>
      ) : null}

      {isLoading ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-3 rounded-2xl border border-border/80 p-4">
            {[1, 2, 3, 4].map((index) => (
              <div key={index} className="grid gap-3 border-b border-border/60 py-4 md:grid-cols-[1.8fr_1fr_1fr]">
                <Skeleton className="h-5 w-44" />
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
      ) : filteredNvrs.length === 0 ? (
        <StatusState
          variant="empty"
          title="No NVRs match the current filters"
          description="Try a broader search or clear the active filters."
        />
      ) : (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
          <CCTVSection
            title="Recorder register"
            description={`${filteredNvrs.length} recorder${filteredNvrs.length === 1 ? "" : "s"} in the current view.`}
          >
            <CCTVSurface className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-sm">
                  <thead className="border-b border-border/70 bg-muted/40 text-left text-xs uppercase tracking-[0.16em] text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3 font-medium">Recorder</th>
                      <th className="px-4 py-3 font-medium">Site</th>
                      <th className="px-4 py-3 font-medium">Network</th>
                      <th className="px-4 py-3 font-medium">State</th>
                      <th className="px-4 py-3 font-medium">Last heartbeat</th>
                      <th className="px-4 py-3 font-medium text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredNvrs.map((nvr) => {
                      const isSelected = selectedNvr?.id === nvr.id;
                      return (
                        <tr
                          key={nvr.id}
                          className={[
                            "border-b border-border/60 transition-colors hover:bg-muted/40",
                            isSelected ? "bg-muted/50" : "",
                            createdId === nvr.id ? "bg-emerald-50/60" : "",
                          ].join(" ")}
                          onClick={() => setSelectedNvrId(nvr.id)}
                        >
                          <td className="px-4 py-4">
                            <div className="flex items-start gap-3">
                              <div
                                className={[
                                  "mt-0.5 h-2.5 w-2.5 rounded-full",
                                  nvr.isOnline ? "bg-emerald-500" : "bg-rose-500",
                                ].join(" ")}
                              />
                              <div className="space-y-1">
                                <div className="font-semibold text-foreground">{nvr.name}</div>
                                <div className="text-xs text-muted-foreground">
                                  {nvr.manufacturer}
                                  {nvr.model ? ` | ${nvr.model}` : ""}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            <div className="space-y-1">
                              <div className="font-medium">{nvr.site?.name || "Unknown site"}</div>
                              <div className="text-xs text-muted-foreground">{nvr.site?.code || "No code"}</div>
                            </div>
                          </td>
                          <td className="px-4 py-4 font-mono text-xs">
                            <div className="space-y-1">
                              <div>{nvr.ipAddress}</div>
                              <div className="text-muted-foreground">
                                RTSP {nvr.port} | HTTP {nvr.httpPort}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            <div className="flex flex-wrap gap-2">
                              <Badge variant={nvr.isOnline ? "outline" : "destructive"}>
                                {nvr.isOnline ? (
                                  <CheckCircle className="mr-1 h-3 w-3" />
                                ) : (
                                  <XCircle className="mr-1 h-3 w-3" />
                                )}
                                {nvr.isOnline ? "Online" : "Offline"}
                              </Badge>
                              {nvr._count ? (
                                <Badge variant="secondary">{nvr._count.cameras} cameras</Badge>
                              ) : null}
                            </div>
                          </td>
                          <td className="px-4 py-4 text-xs text-muted-foreground">
                            {formatHeartbeat(nvr.lastHeartbeat)}
                          </td>
                          <td className="px-4 py-4">
                            <div className="flex justify-end gap-2">
                              <Button asChild size="sm" variant="outline" onClick={(event) => event.stopPropagation()}>
                                <Link href={`/cctv/nvrs/${nvr.id}/edit`}>
                                  <Pencil className="mr-1 h-3 w-3" />
                                  Edit
                                </Link>
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  deactivateMutation.mutate(nvr.id);
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

          <CCTVSection title="Recorder details" description="Connection summary and maintenance actions.">
            <CCTVSurface className="p-4">
              {selectedNvr ? (
                <div className="space-y-5">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-semibold">{selectedNvr.name}</h3>
                      <Badge variant={selectedNvr.isOnline ? "outline" : "destructive"}>
                        {selectedNvr.isOnline ? "Online" : "Offline"}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {selectedNvr.site?.name || "Unknown site"}
                    </p>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
                      <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Address</div>
                      <div className="mt-1 font-mono text-sm">{selectedNvr.ipAddress}</div>
                      <div className="text-sm text-muted-foreground">
                        RTSP {selectedNvr.port} | HTTP {selectedNvr.httpPort}
                      </div>
                    </div>
                    <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
                      <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Inventory</div>
                      <div className="mt-1 font-medium tabular-nums">{selectedNvr._count?.cameras || 0} cameras</div>
                      <div className="text-sm text-muted-foreground">Managed on this recorder</div>
                    </div>
                  </div>

                  <div className="grid gap-3">
                    <div className="flex items-center justify-between border-b border-border/60 pb-2 text-sm">
                      <span className="text-muted-foreground">Manufacturer</span>
                      <span>{selectedNvr.manufacturer}</span>
                    </div>
                    <div className="flex items-center justify-between border-b border-border/60 pb-2 text-sm">
                      <span className="text-muted-foreground">Model</span>
                      <span>{selectedNvr.model || "-"}</span>
                    </div>
                    <div className="flex items-center justify-between border-b border-border/60 pb-2 text-sm">
                      <span className="text-muted-foreground">Firmware</span>
                      <span>{selectedNvr.firmware || "-"}</span>
                    </div>
                    <div className="flex items-center justify-between border-b border-border/60 pb-2 text-sm">
                      <span className="text-muted-foreground">Last heartbeat</span>
                      <span>{formatHeartbeat(selectedNvr.lastHeartbeat)}</span>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button asChild variant="outline">
                      <Link href={`/cctv/nvrs/${selectedNvr.id}/edit`}>
                        <Pencil className="mr-2 h-4 w-4" />
                        Edit recorder
                      </Link>
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => deactivateMutation.mutate(selectedNvr.id)}
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
                  title="No recorder selected"
                  description="Choose a recorder from the register to inspect its status."
                />
              )}
            </CCTVSurface>
          </CCTVSection>
        </div>
      )}

      <div className="absolute left-[-9999px] top-0">
        <div ref={nvrsPdfRef}>
          <PdfTemplate
            title="CCTV NVRs"
            subtitle={`${activeSiteName} | ${statusFilter || "All statuses"}`}
            meta={[
              { label: "Site", value: activeSiteName },
              { label: "Total NVRs", value: String(nvrs.length) },
              { label: "Online", value: String(onlineCount) },
              { label: "Offline", value: String(offlineCount) },
            ]}
          >
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-200 text-left">
                  <th className="py-2">NVR</th>
                  <th className="py-2">Site</th>
                  <th className="py-2">IP</th>
                  <th className="py-2">Ports</th>
                  <th className="py-2">Status</th>
                  <th className="py-2 text-right">Cameras</th>
                </tr>
              </thead>
              <tbody>
                {filteredNvrs.map((nvr) => (
                  <tr key={nvr.id} className="border-b border-gray-100">
                    <td className="py-2">
                      <div className="font-semibold">{nvr.name}</div>
                      <div className="text-[10px] text-gray-500">
                        {nvr.manufacturer}
                        {nvr.model ? ` | ${nvr.model}` : ""}
                      </div>
                    </td>
                    <td className="py-2">{nvr.site?.name || "Unknown"}</td>
                    <td className="py-2 font-mono">{nvr.ipAddress}</td>
                    <td className="py-2 font-mono">
                      RTSP {nvr.port} / HTTP {nvr.httpPort}
                    </td>
                    <td className="py-2">{nvr.isOnline ? "Online" : "Offline"}</td>
                    <td className="py-2 text-right">{nvr._count?.cameras ?? 0}</td>
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
