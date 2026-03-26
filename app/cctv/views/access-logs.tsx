"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { Camera, Site, fetchCCTVAccessLogs } from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api-client";
import { PageIntro } from "@/components/shared/page-intro";
import { StatusState } from "@/components/shared/status-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExportMenu } from "@/components/ui/export-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { type DocumentExportFormat } from "@/lib/documents/export-client";
import { exportElementToDocument } from "@/lib/pdf";
import { CCTVMetricStrip, CCTVSurface } from "@/components/cctv/cctv-panels";
import { FileCheck, History } from "@/lib/icons";

type AccessLogsViewProps = {
  sites: Site[];
  cameras: Camera[];
};

export function AccessLogsView({ sites, cameras }: AccessLogsViewProps) {
  const exportRef = useRef<HTMLDivElement | null>(null);
  const [siteId, setSiteId] = useState<string>("");
  const [cameraId, setCameraId] = useState<string>("");
  const [accessType, setAccessType] = useState<string>("");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null);

  const filteredCameras = useMemo(
    () => cameras.filter((camera) => (siteId ? camera.siteId === siteId : true)),
    [cameras, siteId],
  );

  const { data, isLoading, error } = useQuery({
    queryKey: ["cctv-access-logs", siteId, cameraId, accessType, startDate, endDate],
    queryFn: () =>
      fetchCCTVAccessLogs({
        siteId: siteId || undefined,
        cameraId: cameraId || undefined,
        accessType: accessType || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        limit: 100,
      }),
  });

  const logs = data?.data || [];
  const selectedLog = logs.find((log) => log.id === selectedLogId) ?? logs[0] ?? null;
  const accessTypeCounts = useMemo(() => {
    const counts = logs.reduce<Record<string, number>>((acc, log) => {
      acc[log.accessType] = (acc[log.accessType] || 0) + 1;
      return acc;
    }, {});
    return counts;
  }, [logs]);
  const uniqueUsers = new Set(logs.map((log) => log.user?.id || log.user?.email || log.userId || "unknown")).size;

  useEffect(() => {
    if (selectedLog && selectedLog.id !== selectedLogId) {
      setSelectedLogId(selectedLog.id);
    }
  }, [selectedLog, selectedLogId]);

  const siteName = sites.find((site) => site.id === siteId)?.name || "All sites";
  const exportDisabled = isLoading || logs.length === 0;

  if (error) {
    return (
      <StatusState
        variant="error"
        title="Unable to load access logs"
        description={getApiErrorMessage(error)}
      />
    );
  }

  return (
    <div className="space-y-4">
      <PageIntro
        title="Access Logs"
        purpose="Review who accessed live and playback streams across sites."
        nextStep="Filter by site, camera, and date range to inspect security access history."
        actions={
          <ExportMenu
            variant="outline"
            size="sm"
            disabled={exportDisabled}
            onExport={(format: DocumentExportFormat) => {
              if (!exportRef.current) return;
              return exportElementToDocument(
                exportRef.current,
                `cctv-access-logs-${new Date().toISOString().slice(0, 10)}.${format}`,
                format,
              );
            }}
          />
        }
      />

      <CCTVSurface
        title="Audit Filters"
        description="Narrow the log set before opening the detail pane."
      >
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <div className="space-y-2">
            <label className="text-field-label text-foreground">Site</label>
            <Select
              value={siteId}
              onValueChange={(value) => {
                setSiteId(value === "__all_sites__" ? "" : value);
                setCameraId("");
              }}
            >
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
            <label className="text-field-label text-foreground">Camera</label>
            <Select
              value={cameraId}
              onValueChange={(value) => setCameraId(value === "__all_cameras__" ? "" : value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="All cameras" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all_cameras__">All cameras</SelectItem>
                {filteredCameras.map((camera) => (
                  <SelectItem key={camera.id} value={camera.id}>
                    {camera.site?.name || "Unknown Site"} | {camera.area} | {camera.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-field-label text-foreground">Access Type</label>
            <Select
              value={accessType}
              onValueChange={(value) => setAccessType(value === "__all_types__" ? "" : value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="All types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all_types__">All types</SelectItem>
                <SelectItem value="LIVE_VIEW">Live view</SelectItem>
                <SelectItem value="PLAYBACK">Playback</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-field-label text-foreground">Start Date</label>
            <Input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
          </div>

          <div className="space-y-2">
            <label className="text-field-label text-foreground">End Date</label>
            <Input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
          </div>
        </div>
      </CCTVSurface>

      <CCTVMetricStrip
        metrics={[
          {
            label: "Access Events",
            value: logs.length.toLocaleString(),
            hint: `Scope: ${siteName}`,
          },
          {
            label: "Live Views",
            value: (accessTypeCounts.LIVE_VIEW || 0).toLocaleString(),
            hint: "Direct camera access",
          },
          {
            label: "Playback",
            value: (accessTypeCounts.PLAYBACK || 0).toLocaleString(),
            hint: "Recorded footage review",
          },
          {
            label: "Unique Users",
            value: uniqueUsers.toLocaleString(),
            hint: "People in the selected view",
          },
        ]}
      />

      {isLoading ? (
        <StatusState
          variant="loading"
          title="Loading log rows"
          description="Fetching the latest camera access activity."
        />
      ) : logs.length === 0 ? (
        <StatusState
          variant="empty"
          title="No access logs found"
          description="Try broadening the selected filters to view historical activity."
        />
      ) : (
        <div className="grid gap-4 xl:grid-cols-[1.4fr_0.9fr]">
          <CCTVSurface title="Log Entries" description="Select a row to inspect the audit trail." contentClassName="p-0">
            <div className="table-rail" ref={exportRef}>
              <Table className="w-full text-sm">
                <TableHeader className="bg-muted/60">
                  <TableRow>
                    <TableHead className="p-3 text-left font-semibold">Start Time</TableHead>
                    <TableHead className="p-3 text-left font-semibold">End Time</TableHead>
                    <TableHead className="p-3 text-left font-semibold">Type</TableHead>
                    <TableHead className="p-3 text-left font-semibold">User</TableHead>
                    <TableHead className="p-3 text-left font-semibold">Camera</TableHead>
                    <TableHead className="p-3 text-left font-semibold">Site</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => (
                  <TableRow
                      key={log.id}
                      className={selectedLog?.id === log.id ? "cursor-pointer bg-muted/60" : "cursor-pointer border-b"}
                      onClick={() => setSelectedLogId(log.id)}
                    >
                      <TableCell className="p-3">{new Date(log.startTime).toLocaleString()}</TableCell>
                      <TableCell className="p-3">
                        {log.endTime ? new Date(log.endTime).toLocaleString() : "-"}
                      </TableCell>
                      <TableCell className="p-3">
                        <Badge variant={log.accessType === "PLAYBACK" ? "outline" : "secondary"}>
                          {log.accessType}
                        </Badge>
                      </TableCell>
                      <TableCell className="p-3">{log.user?.name || "Unknown user"}</TableCell>
                      <TableCell className="p-3">{log.camera.name}</TableCell>
                      <TableCell className="p-3">{log.camera.site.name}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CCTVSurface>

          <CCTVSurface
            title="Access Detail"
            description="Use the detail pane for audit context and quick cross-checks."
            contentClassName="space-y-4"
          >
            {selectedLog ? (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={selectedLog.accessType === "PLAYBACK" ? "outline" : "secondary"}>
                    {selectedLog.accessType}
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    {new Date(selectedLog.startTime).toLocaleString()}
                  </span>
                </div>

                <div className="space-y-2">
                  <p className="text-base font-semibold text-foreground">
                    {selectedLog.user?.name || "Unknown user"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {selectedLog.purpose || "No purpose recorded."}
                  </p>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-[var(--edge-subtle)] p-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      Camera
                    </p>
                    <p className="mt-2 text-sm font-medium text-foreground">{selectedLog.camera.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {selectedLog.camera.site.name} | {selectedLog.camera.area}
                    </p>
                  </div>
                  <div className="rounded-xl border border-[var(--edge-subtle)] p-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      Access Window
                    </p>
                    <p className="mt-2 text-sm font-medium text-foreground">
                      {new Date(selectedLog.startTime).toLocaleString()}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {selectedLog.endTime ? new Date(selectedLog.endTime).toLocaleString() : "Still open"}
                    </p>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-[var(--edge-subtle)] p-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      Duration
                    </p>
                    <p className="mt-2 text-sm font-medium text-foreground">
                      {selectedLog.duration ? `${Math.max(1, Math.round(selectedLog.duration / 60))} min` : "Unknown"}
                    </p>
                  </div>
                  <div className="rounded-xl border border-[var(--edge-subtle)] p-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      Network
                    </p>
                    <p className="mt-2 text-sm font-medium text-foreground">
                      {selectedLog.ipAddress || "Unknown IP"}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button asChild variant="outline">
                    <Link href="/cctv/playback">
                      <History className="mr-2 h-4 w-4" />
                      Go to Playback
                    </Link>
                  </Button>
                  <Button asChild variant="outline">
                    <Link href="/cctv/live">
                      <FileCheck className="mr-2 h-4 w-4" />
                      Open Live Monitor
                    </Link>
                  </Button>
                </div>
              </>
            ) : (
              <StatusState
                variant="empty"
                title="No log selected"
                description="Pick an access log to inspect the full audit trail."
              />
            )}
          </CCTVSurface>
        </div>
      )}

      <div className="absolute left-[-9999px] top-0">
        <div ref={exportRef}>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-200 text-left">
                <th className="py-2">Start Time</th>
                <th className="py-2">End Time</th>
                <th className="py-2">Type</th>
                <th className="py-2">User</th>
                <th className="py-2">Camera</th>
                <th className="py-2">Site</th>
                <th className="py-2">Purpose</th>
                <th className="py-2">IP</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} className="border-b border-gray-100">
                  <td className="py-2">{new Date(log.startTime).toLocaleString()}</td>
                  <td className="py-2">{log.endTime ? new Date(log.endTime).toLocaleString() : "-"}</td>
                  <td className="py-2">{log.accessType}</td>
                  <td className="py-2">{log.user?.name || "Unknown user"}</td>
                  <td className="py-2">{log.camera.name}</td>
                  <td className="py-2">{log.camera.site.name}</td>
                  <td className="py-2">{log.purpose || "-"}</td>
                  <td className="py-2">{log.ipAddress || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
