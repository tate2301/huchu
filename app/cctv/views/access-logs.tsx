"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { Camera, Site, fetchCCTVAccessLogs } from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api-client";
import { PageIntro } from "@/components/shared/page-intro";
import { StatusState } from "@/components/shared/status-state";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type AccessLogsViewProps = {
  sites: Site[];
  cameras: Camera[];
};

export function AccessLogsView({ sites, cameras }: AccessLogsViewProps) {
  const [siteId, setSiteId] = useState<string>("");
  const [cameraId, setCameraId] = useState<string>("");
  const [accessType, setAccessType] = useState<string>("");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");

  const filteredCameras = useMemo(
    () => cameras.filter((camera) => (siteId ? camera.siteId === siteId : true)),
    [cameras, siteId],
  );

  const { data, isLoading, error } = useQuery({
    queryKey: [
      "cctv-access-logs",
      siteId,
      cameraId,
      accessType,
      startDate,
      endDate,
    ],
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

  return (
    <div className="space-y-4">
      <PageIntro
        title="Access Logs"
        purpose="Review who accessed live and playback streams across sites."
        nextStep="Filter by site, camera, and date range to inspect security access history."
      />

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to load access logs</AlertTitle>
          <AlertDescription>{getApiErrorMessage(error)}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>Narrow down stream access activity.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <div className="space-y-2">
            <label className="text-sm font-medium">Site</label>
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
            <label className="text-sm font-medium">Access Type</label>
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
                <SelectItem value="PTZ_CONTROL">PTZ control</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Start Date</label>
            <Input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">End Date</label>
            <Input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <StatusState
          variant="loading"
          title="Loading log rows"
          description="Fetching latest camera access activity."
        />
      ) : logs.length === 0 ? (
        <StatusState
          variant="empty"
          title="No access logs found"
          description="Try broadening the selected filters to view historical activity."
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Log Entries</CardTitle>
            <CardDescription>{logs.length} access event(s) in this view.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table className="w-full text-sm">
                <TableHeader className="bg-muted">
                  <TableRow>
                    <TableHead className="p-3 text-left font-semibold">Start Time</TableHead>
                    <TableHead className="p-3 text-left font-semibold">End Time</TableHead>
                    <TableHead className="p-3 text-left font-semibold">Type</TableHead>
                    <TableHead className="p-3 text-left font-semibold">User</TableHead>
                    <TableHead className="p-3 text-left font-semibold">Camera</TableHead>
                    <TableHead className="p-3 text-left font-semibold">Site</TableHead>
                    <TableHead className="p-3 text-left font-semibold">Purpose</TableHead>
                    <TableHead className="p-3 text-left font-semibold">IP</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => (
                    <TableRow key={log.id} className="border-b">
                      <TableCell className="p-3">{new Date(log.startTime).toLocaleString()}</TableCell>
                      <TableCell className="p-3">{log.endTime ? new Date(log.endTime).toLocaleString() : "-"}</TableCell>
                      <TableCell className="p-3">{log.accessType}</TableCell>
                      <TableCell className="p-3">{log.user?.name || "Unknown user"}</TableCell>
                      <TableCell className="p-3">{log.camera.name}</TableCell>
                      <TableCell className="p-3">{log.camera.site.name}</TableCell>
                      <TableCell className="p-3">{log.purpose || "-"}</TableCell>
                      <TableCell className="p-3">{log.ipAddress || "-"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}


