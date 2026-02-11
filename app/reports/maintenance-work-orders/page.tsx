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
import { fetchSites, fetchWorkOrders } from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api-client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function MaintenanceWorkOrdersReportPage() {
  const [siteId, setSiteId] = useState("all");
  const [status, setStatus] = useState("all");
  const [startDate, setStartDate] = useState(format(subDays(new Date(), 30), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState(format(new Date(), "yyyy-MM-dd"));

  const { data: sites, isLoading: sitesLoading, error: sitesError } = useQuery({
    queryKey: ["sites"],
    queryFn: fetchSites,
  });

  const activeSiteId = siteId === "all" ? undefined : siteId;
  const { data, isLoading, error } = useQuery({
    queryKey: ["work-orders", "reports", activeSiteId ?? "all", status],
    queryFn: () =>
      fetchWorkOrders({
        siteId: activeSiteId,
        status: status === "all" ? undefined : status,
        limit: 500,
      }),
  });

  const rows = useMemo(() => data?.data ?? [], [data]);
  const filteredRows = useMemo(
    () =>
      rows.filter((row) => {
        const day = format(new Date(row.createdAt), "yyyy-MM-dd");
        return day >= startDate && day <= endDate;
      }),
    [rows, startDate, endDate],
  );

  const pageError = sitesError || error;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <PageHeading title="Work Orders" description="Maintenance work order history and status" />

      {pageError ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to load work orders</AlertTitle>
          <AlertDescription>{getApiErrorMessage(pageError)}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>Filter by site, status, and date range</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-5">
          <div className="md:col-span-2">
            <label className="mb-2 block text-sm font-semibold">Site</label>
            {sitesLoading ? (
              <Skeleton className="h-9 w-full" />
            ) : (
              <Select value={siteId} onValueChange={setSiteId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select site" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All sites</SelectItem>
                  {sites?.map((site) => (
                    <SelectItem key={site.id} value={site.id}>
                      {site.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <div>
            <label className="mb-2 block text-sm font-semibold">Status</label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="OPEN">Open</SelectItem>
                <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
                <SelectItem value="COMPLETED">Completed</SelectItem>
                <SelectItem value="CANCELLED">Cancelled</SelectItem>
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
          <CardDescription>{filteredRows.length} work orders</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : filteredRows.length === 0 ? (
            <div className="text-sm text-muted-foreground">No work orders for the selected filters.</div>
          ) : (
            <div className="overflow-x-auto">
              <Table className="w-full text-sm">
                <TableHeader className="bg-muted">
                  <TableRow>
                    <TableHead className="p-3 text-left font-semibold">Created</TableHead>
                    <TableHead className="p-3 text-left font-semibold">Site</TableHead>
                    <TableHead className="p-3 text-left font-semibold">Equipment</TableHead>
                    <TableHead className="p-3 text-left font-semibold">Issue</TableHead>
                    <TableHead className="p-3 text-left font-semibold">Technician</TableHead>
                    <TableHead className="p-3 text-left font-semibold">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRows.map((row) => (
                    <TableRow key={row.id} className="border-b">
                      <TableCell className="p-3">{format(new Date(row.createdAt), "MMM d, yyyy")}</TableCell>
                      <TableCell className="p-3">{row.equipment.site.name}</TableCell>
                      <TableCell className="p-3">
                        <div className="font-semibold">{row.equipment.name}</div>
                        <div className="text-xs text-muted-foreground">{row.equipment.equipmentCode}</div>
                      </TableCell>
                      <TableCell className="p-3">{row.issue}</TableCell>
                      <TableCell className="p-3">{row.technician?.name ?? "-"}</TableCell>
                      <TableCell className="p-3">
                        <Badge variant={row.status === "COMPLETED" ? "default" : row.status === "OPEN" ? "destructive" : "secondary"}>
                          {row.status}
                        </Badge>
                      </TableCell>
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



