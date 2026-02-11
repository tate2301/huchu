"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, subDays } from "date-fns";

import { PageHeading } from "@/components/layout/page-heading";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchCCTVEvents } from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api-client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function CCTVEventsReportPage() {
  const [severity, setSeverity] = useState("all");
  const [startDate, setStartDate] = useState(format(subDays(new Date(), 6), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState(format(new Date(), "yyyy-MM-dd"));

  const { data, isLoading, error } = useQuery({
    queryKey: ["cctv-events", "reports", severity, startDate, endDate],
    queryFn: () =>
      fetchCCTVEvents({
        severity: severity === "all" ? undefined : severity,
        startDate,
        endDate,
        limit: 500,
      }),
  });

  const rows = useMemo(() => data?.data ?? [], [data]);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <PageHeading title="CCTV Events" description="Security event logs from cameras" />

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to load CCTV events</AlertTitle>
          <AlertDescription>{getApiErrorMessage(error)}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>Filter by severity and date range</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div>
            <label className="mb-2 block text-sm font-semibold">Severity</label>
            <Select value={severity} onValueChange={setSeverity}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="All severities" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All severities</SelectItem>
                <SelectItem value="LOW">Low</SelectItem>
                <SelectItem value="MEDIUM">Medium</SelectItem>
                <SelectItem value="HIGH">High</SelectItem>
                <SelectItem value="CRITICAL">Critical</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="mb-2 block text-sm font-semibold">Start Date</label>
            <Input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
          </div>
          <div>
            <label className="mb-2 block text-sm font-semibold">End Date</label>
            <Input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Records</CardTitle>
          <CardDescription>{rows.length} CCTV events</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : rows.length === 0 ? (
            <div className="text-sm text-muted-foreground">No CCTV events for the selected filters.</div>
          ) : (
            <div className="overflow-x-auto">
              <Table className="w-full text-sm">
                <TableHeader className="bg-muted">
                  <TableRow>
                    <TableHead className="p-3 text-left font-semibold">Event Time</TableHead>
                    <TableHead className="p-3 text-left font-semibold">Type</TableHead>
                    <TableHead className="p-3 text-left font-semibold">Severity</TableHead>
                    <TableHead className="p-3 text-left font-semibold">Title</TableHead>
                    <TableHead className="p-3 text-left font-semibold">Camera</TableHead>
                    <TableHead className="p-3 text-left font-semibold">Site</TableHead>
                    <TableHead className="p-3 text-left font-semibold">Acknowledged</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.id} className="border-b">
                      <TableCell className="p-3">{format(new Date(row.eventTime), "MMM d, yyyy HH:mm")}</TableCell>
                      <TableCell className="p-3">{row.eventType}</TableCell>
                      <TableCell className="p-3">
                        <Badge variant={row.severity === "HIGH" || row.severity === "CRITICAL" ? "destructive" : "secondary"}>
                          {row.severity}
                        </Badge>
                      </TableCell>
                      <TableCell className="p-3">{row.title}</TableCell>
                      <TableCell className="p-3">{row.camera?.name ?? "-"}</TableCell>
                      <TableCell className="p-3">{row.camera?.site?.name ?? "-"}</TableCell>
                      <TableCell className="p-3">{row.isAcknowledged ? "Yes" : "No"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}



