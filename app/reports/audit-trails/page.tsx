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
import { fetchGoldCorrections, fetchSites, fetchStockMovements, fetchWorkOrders } from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api-client";

type AuditRow = {
  id: string;
  at: string;
  module: "GOLD" | "STORES" | "MAINTENANCE";
  action: string;
  actor: string;
  site: string;
  details: string;
};

export default function AuditTrailsReportPage() {
  const [siteId, setSiteId] = useState("all");
  const [moduleFilter, setModuleFilter] = useState("all");
  const [startDate, setStartDate] = useState(format(subDays(new Date(), 30), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState(format(new Date(), "yyyy-MM-dd"));

  const { data: sites, isLoading: sitesLoading, error: sitesError } = useQuery({
    queryKey: ["sites"],
    queryFn: fetchSites,
  });

  const activeSiteId = siteId === "all" ? undefined : siteId;

  const { data: correctionsData, isLoading: correctionsLoading, error: correctionsError } = useQuery({
    queryKey: ["gold-corrections", "audit-reports", activeSiteId ?? "all"],
    queryFn: () => fetchGoldCorrections({ siteId: activeSiteId, limit: 500 }),
  });
  const { data: movementsData, isLoading: movementsLoading, error: movementsError } = useQuery({
    queryKey: ["stock-movements", "audit-reports", activeSiteId ?? "all"],
    queryFn: () => fetchStockMovements({ siteId: activeSiteId, limit: 500 }),
  });
  const { data: workOrdersData, isLoading: workOrdersLoading, error: workOrdersError } = useQuery({
    queryKey: ["work-orders", "audit-reports", activeSiteId ?? "all"],
    queryFn: () => fetchWorkOrders({ siteId: activeSiteId, limit: 500 }),
  });

  const rows = useMemo<AuditRow[]>(() => {
    const correctionRows: AuditRow[] = (correctionsData?.data ?? []).map((row) => ({
      id: `gold-${row.id}`,
      at: row.createdAt,
      module: "GOLD",
      action: `${row.entityType} correction`,
      actor: row.createdBy.name,
      site: row.pour.site.name,
      details: row.reason,
    }));

    const movementRows: AuditRow[] = (movementsData?.data ?? []).map((row) => ({
      id: `stores-${row.id}`,
      at: row.createdAt,
      module: "STORES",
      action: `${row.movementType} movement`,
      actor: row.approvedBy ?? row.requestedBy ?? row.issuedBy?.name ?? "System",
      site: row.item.site.name,
      details: `${row.item.name} ${row.quantity} ${row.unit}`,
    }));

    const workOrderRows: AuditRow[] = (workOrdersData?.data ?? []).map((row) => ({
      id: `maint-${row.id}`,
      at: row.createdAt,
      module: "MAINTENANCE",
      action: `Work order ${row.status.toLowerCase()}`,
      actor: row.technician?.name ?? "System",
      site: row.equipment.site.name,
      details: `${row.equipment.name}: ${row.issue}`,
    }));

    return [...correctionRows, ...movementRows, ...workOrderRows].sort(
      (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
    );
  }, [correctionsData, movementsData, workOrdersData]);

  const filteredRows = useMemo(
    () =>
      rows
        .filter((row) => {
          const day = format(new Date(row.at), "yyyy-MM-dd");
          return day >= startDate && day <= endDate;
        })
        .filter((row) => moduleFilter === "all" || row.module === moduleFilter),
    [rows, startDate, endDate, moduleFilter],
  );

  const isLoading = correctionsLoading || movementsLoading || workOrdersLoading;
  const pageError = sitesError || correctionsError || movementsError || workOrdersError;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <PageHeading title="Audit Trails" description="Operational audit events across modules" />

      {pageError ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to load audit trails</AlertTitle>
          <AlertDescription>{getApiErrorMessage(pageError)}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>Filter by site, module, and date range</CardDescription>
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
            <label className="mb-2 block text-sm font-semibold">Module</label>
            <Select value={moduleFilter} onValueChange={setModuleFilter}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="All modules" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All modules</SelectItem>
                <SelectItem value="GOLD">Gold</SelectItem>
                <SelectItem value="STORES">Stores</SelectItem>
                <SelectItem value="MAINTENANCE">Maintenance</SelectItem>
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
          <CardDescription>{filteredRows.length} audit events</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : filteredRows.length === 0 ? (
            <div className="text-sm text-muted-foreground">No audit events for the selected filters.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="p-3 text-left font-semibold">Time</th>
                    <th className="p-3 text-left font-semibold">Module</th>
                    <th className="p-3 text-left font-semibold">Action</th>
                    <th className="p-3 text-left font-semibold">Actor</th>
                    <th className="p-3 text-left font-semibold">Site</th>
                    <th className="p-3 text-left font-semibold">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row) => (
                    <tr key={row.id} className="border-b">
                      <td className="p-3">{format(new Date(row.at), "MMM d, yyyy HH:mm")}</td>
                      <td className="p-3">
                        <Badge variant={row.module === "GOLD" ? "secondary" : row.module === "STORES" ? "outline" : "default"}>
                          {row.module}
                        </Badge>
                      </td>
                      <td className="p-3">{row.action}</td>
                      <td className="p-3">{row.actor}</td>
                      <td className="p-3">{row.site}</td>
                      <td className="p-3">{row.details}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

