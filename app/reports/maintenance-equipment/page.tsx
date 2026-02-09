"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";

import { PageHeading } from "@/components/layout/page-heading";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchEquipment, fetchSites } from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api-client";

export default function MaintenanceEquipmentReportPage() {
  const [siteId, setSiteId] = useState("all");
  const [nowTimestamp] = useState<number>(() => Date.now());

  const { data: sites, isLoading: sitesLoading, error: sitesError } = useQuery({
    queryKey: ["sites"],
    queryFn: fetchSites,
  });

  const activeSiteId = siteId === "all" ? undefined : siteId;
  const { data, isLoading, error } = useQuery({
    queryKey: ["equipment", "reports", activeSiteId ?? "all"],
    queryFn: () => fetchEquipment({ siteId: activeSiteId, limit: 500 }),
  });

  const rows = useMemo(() => data?.data ?? [], [data]);
  const pageError = sitesError || error;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <PageHeading title="Equipment Service" description="Equipment register and service status" />

      {pageError ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to load equipment records</AlertTitle>
          <AlertDescription>{getApiErrorMessage(pageError)}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>Filter by site</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="max-w-md">
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Records</CardTitle>
          <CardDescription>{rows.length} equipment records</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : rows.length === 0 ? (
            <div className="text-sm text-muted-foreground">No equipment records found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="p-3 text-left font-semibold">Code</th>
                    <th className="p-3 text-left font-semibold">Name</th>
                    <th className="p-3 text-left font-semibold">Category</th>
                    <th className="p-3 text-left font-semibold">Site</th>
                    <th className="p-3 text-left font-semibold">Last Service</th>
                    <th className="p-3 text-left font-semibold">Next Service</th>
                    <th className="p-3 text-left font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const needsService =
                      row.nextServiceDue && new Date(row.nextServiceDue).getTime() < nowTimestamp;
                    return (
                      <tr key={row.id} className="border-b">
                        <td className="p-3 font-mono">{row.equipmentCode}</td>
                        <td className="p-3 font-semibold">{row.name}</td>
                        <td className="p-3">{row.category}</td>
                        <td className="p-3">{row.site.name}</td>
                        <td className="p-3">
                          {row.lastServiceDate ? format(new Date(row.lastServiceDate), "yyyy-MM-dd") : "-"}
                        </td>
                        <td className="p-3">
                          {row.nextServiceDue ? format(new Date(row.nextServiceDue), "yyyy-MM-dd") : "-"}
                        </td>
                        <td className="p-3">
                          <Badge variant={!row.isActive ? "destructive" : needsService ? "secondary" : "default"}>
                            {!row.isActive ? "Down" : needsService ? "Needs Service" : "Operational"}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
