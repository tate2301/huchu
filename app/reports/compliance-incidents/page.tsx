"use client";

import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useQuery } from "@tanstack/react-query";
import { format, subDays } from "date-fns";

import { PageHeading } from "@/components/layout/page-heading";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { DataTable, type DataTableQueryState } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import { NumericCell } from "@/components/ui/numeric-cell";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchIncidents, fetchSites } from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api-client";

export default function ComplianceIncidentsReportPage() {
  const [siteId, setSiteId] = useState("all");
  const [severity, setSeverity] = useState("all");
  const [startDate, setStartDate] = useState(format(subDays(new Date(), 30), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [queryState, setQueryState] = useState<DataTableQueryState>({
    mode: "paginated",
    page: 1,
    pageSize: 25,
    search: "",
  });

  const { data: sites, isLoading: sitesLoading, error: sitesError } = useQuery({
    queryKey: ["sites"],
    queryFn: fetchSites,
  });

  const activeSiteId = siteId === "all" ? undefined : siteId;
  const { data, isLoading, error } = useQuery({
    queryKey: ["incidents", "reports", activeSiteId ?? "all", severity, startDate, endDate],
    queryFn: () =>
      fetchIncidents({
        siteId: activeSiteId,
        severity: severity === "all" ? undefined : severity,
        startDate,
        endDate,
        limit: 500,
      }),
  });

  const rows = useMemo(() => data?.data ?? [], [data]);
  const pageError = sitesError || error;
  const columns = useMemo<ColumnDef<(typeof rows)[number]>[]>(
    () => [
      {
        id: "date",
        header: "Date",
        accessorFn: (row) => row.incidentDate,
        cell: ({ row }) => <NumericCell align="left">{format(new Date(row.original.incidentDate), "MMM d, yyyy")}</NumericCell>,
      },
      { id: "site", header: "Site", accessorFn: (row) => row.site.name, cell: ({ row }) => row.original.site.name },
      { id: "type", header: "Type", accessorFn: (row) => row.incidentType, cell: ({ row }) => row.original.incidentType },
      {
        id: "severity",
        header: "Severity",
        accessorFn: (row) => row.severity,
        cell: ({ row }) => (
          <Badge variant={row.original.severity === "CRITICAL" || row.original.severity === "HIGH" ? "destructive" : "secondary"}>
            {row.original.severity}
          </Badge>
        ),
      },
      { id: "status", header: "Status", accessorFn: (row) => row.status, cell: ({ row }) => row.original.status },
      { id: "reportedBy", header: "Reported By", accessorFn: (row) => row.reportedBy, cell: ({ row }) => row.original.reportedBy },
    ],
    [],
  );

  return (
    <div className="w-full space-y-6">
      <PageHeading title="Incidents" description="Compliance and safety incident records" />

      {pageError ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to load incident records</AlertTitle>
          <AlertDescription>{getApiErrorMessage(pageError)}</AlertDescription>
        </Alert>
      ) : null}

      <section className="space-y-3">
        <header className="section-shell space-y-1">
          <h2 className="text-section-title text-foreground font-bold tracking-tight">Records</h2>
          <p className="text-sm text-muted-foreground">{rows.length} incident records</p>
        </header>
        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : rows.length === 0 ? (
          <div className="text-sm text-muted-foreground">No incident records found.</div>
        ) : (
          <DataTable
            data={rows}
            columns={columns}
            queryState={queryState}
            onQueryStateChange={(next) => setQueryState((prev) => ({ ...prev, ...next }))}
            searchPlaceholder="Search site, type, reporter"
            searchSubmitLabel="Search"
            tableClassName="text-sm"
            pagination={{ enabled: true }}
            toolbar={
              <>
                {sitesLoading ? (
                  <Skeleton className="h-8 w-[180px]" />
                ) : (
                  <Select
                    value={siteId}
                    onValueChange={(value) => {
                      setSiteId(value);
                      setQueryState((prev) => ({ ...prev, page: 1 }));
                    }}
                  >
                    <SelectTrigger className="h-8 w-[180px]">
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
                <Select
                  value={severity}
                  onValueChange={(value) => {
                    setSeverity(value);
                    setQueryState((prev) => ({ ...prev, page: 1 }));
                  }}
                >
                  <SelectTrigger className="h-8 w-[150px]">
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
                <Input
                  type="date"
                  value={startDate}
                  onChange={(event) => {
                    setStartDate(event.target.value);
                    setQueryState((prev) => ({ ...prev, page: 1 }));
                  }}
                  className="h-8 w-[155px]"
                />
                <Input
                  type="date"
                  value={endDate}
                  onChange={(event) => {
                    setEndDate(event.target.value);
                    setQueryState((prev) => ({ ...prev, page: 1 }));
                  }}
                  className="h-8 w-[155px]"
                />
              </>
            }
          />
        )}
      </section>
    </div>
  );
}



