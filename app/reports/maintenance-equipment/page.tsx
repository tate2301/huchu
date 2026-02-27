"use client";

import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";

import { PageHeading } from "@/components/layout/page-heading";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ExportMenu } from "@/components/ui/export-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchEquipment, fetchSites } from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api-client";
import { type DocumentExportFormat } from "@/lib/documents/export-client";
import { exportElementToDocument } from "@/lib/pdf";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function MaintenanceEquipmentReportPage() {
  const exportRef = useRef<HTMLDivElement | null>(null);
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
  const displayRows = useMemo(
    () =>
      rows.map((row) => {
        const needsService =
          row.nextServiceDue && new Date(row.nextServiceDue).getTime() < nowTimestamp;
        const statusVariant: React.ComponentProps<typeof Badge>["variant"] = !row.isActive
          ? "destructive"
          : needsService
            ? "secondary"
            : "default";
        return {
          id: row.id,
          equipmentCode: row.equipmentCode,
          name: row.name,
          category: row.category,
          siteName: row.site.name,
          lastServiceLabel: row.lastServiceDate
            ? format(new Date(row.lastServiceDate), "yyyy-MM-dd")
            : "-",
          nextServiceLabel: row.nextServiceDue
            ? format(new Date(row.nextServiceDue), "yyyy-MM-dd")
            : "-",
          statusVariant,
          statusLabel: !row.isActive
            ? "Down"
            : needsService
              ? "Needs Service"
              : "Operational",
        };
      }),
    [rows, nowTimestamp],
  );
  const pageError = sitesError || error;

  return (
    <div className="w-full space-y-6">
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
          <div className="flex items-start justify-between gap-2">
            <div>
              <CardTitle>Records</CardTitle>
              <CardDescription>{displayRows.length} equipment records</CardDescription>
            </div>
            <ExportMenu
              variant="outline"
              size="sm"
              disabled={isLoading || displayRows.length === 0}
              onExport={(format: DocumentExportFormat) => {
                if (!exportRef.current) return;
                return exportElementToDocument(
                  exportRef.current,
                  `report-maintenance-equipment-${siteId || "all"}.${format}`,
                  format,
                );
              }}
            />
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : displayRows.length === 0 ? (
            <div className="text-sm text-muted-foreground">No equipment records found.</div>
          ) : (
            <div ref={exportRef} className="overflow-x-auto">
              <Table className="w-full text-sm">
                <TableHeader className="bg-muted">
                  <TableRow>
                    <TableHead className="p-3 text-left font-semibold">Code</TableHead>
                    <TableHead className="p-3 text-left font-semibold">Name</TableHead>
                    <TableHead className="p-3 text-left font-semibold">Category</TableHead>
                    <TableHead className="p-3 text-left font-semibold">Site</TableHead>
                    <TableHead className="p-3 text-left font-semibold">Last Service</TableHead>
                    <TableHead className="p-3 text-left font-semibold">Next Service</TableHead>
                    <TableHead className="p-3 text-left font-semibold">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {displayRows.map((row) => (
                    <TableRow key={row.id} className="border-b">
                      <TableCell className="p-3 font-mono">{row.equipmentCode}</TableCell>
                      <TableCell className="p-3 font-semibold">{row.name}</TableCell>
                      <TableCell className="p-3">{row.category}</TableCell>
                      <TableCell className="p-3">{row.siteName}</TableCell>
                      <TableCell className="p-3">{row.lastServiceLabel}</TableCell>
                      <TableCell className="p-3">{row.nextServiceLabel}</TableCell>
                      <TableCell className="p-3">
                        <Badge variant={row.statusVariant}>{row.statusLabel}</Badge>
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


