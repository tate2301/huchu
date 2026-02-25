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
  const columns = useMemo<ColumnDef<AuditRow>[]>(
    () => [
      {
        id: "at",
        header: "Time",
        accessorFn: (row) => row.at,
        cell: ({ row }) => (
          <NumericCell align="left">{format(new Date(row.original.at), "MMM d, yyyy HH:mm")}</NumericCell>
        ),
        size: 128,
        minSize: 128,
        maxSize: 128},
      {
        id: "module",
        header: "Module",
        accessorFn: (row) => row.module,
        cell: ({ row }) => (
          <Badge
            variant={row.original.module === "GOLD" ? "secondary" : row.original.module === "STORES" ? "outline" : "default"}
          >
            {row.original.module}
          </Badge>
        ),
        size: 160,
        minSize: 160,
        maxSize: 160},
      { id: "action", header: "Action", accessorFn: (row) => row.action, cell: ({ row }) => row.original.action ,
        size: 108,
        minSize: 108,
        maxSize: 108},
      { id: "actor", header: "Actor", accessorFn: (row) => row.actor, cell: ({ row }) => row.original.actor ,
        size: 160,
        minSize: 160,
        maxSize: 160},
      { id: "site", header: "Site", accessorFn: (row) => row.site, cell: ({ row }) => row.original.site ,
        size: 280,
        minSize: 220,
        maxSize: 420},
      { id: "details", header: "Details", accessorFn: (row) => row.details, cell: ({ row }) => row.original.details ,
        size: 260,
        minSize: 200,
        maxSize: 360},
    ],
    [],
  );

  return (
    <div className="w-full space-y-6">
      <PageHeading title="Audit Trails" description="Operational audit events across modules" />

      {pageError ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to load audit trails</AlertTitle>
          <AlertDescription>{getApiErrorMessage(pageError)}</AlertDescription>
        </Alert>
      ) : null}

      <section className="space-y-3">
        <header className="section-shell space-y-1">
          <h2 className="text-section-title text-foreground font-bold tracking-tight">Records</h2>
          <p className="text-sm text-muted-foreground">{filteredRows.length} audit events</p>
        </header>
        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : filteredRows.length === 0 ? (
          <div className="text-sm text-muted-foreground">No audit events for the selected filters.</div>
        ) : (
          <DataTable
            data={filteredRows}
            columns={columns}
            queryState={queryState}
            onQueryStateChange={(next) => setQueryState((prev) => ({ ...prev, ...next }))}
            searchPlaceholder="Search action, actor, site, details"
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
                  value={moduleFilter}
                  onValueChange={(value) => {
                    setModuleFilter(value);
                    setQueryState((prev) => ({ ...prev, page: 1 }));
                  }}
                >
                  <SelectTrigger className="h-8 w-[150px]">
                    <SelectValue placeholder="All modules" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All modules</SelectItem>
                    <SelectItem value="GOLD">Gold</SelectItem>
                    <SelectItem value="STORES">Stores</SelectItem>
                    <SelectItem value="MAINTENANCE">Maintenance</SelectItem>
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



