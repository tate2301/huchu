"use client";

import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useQuery } from "@tanstack/react-query";
import { format, subDays } from "date-fns";

import { PageHeading } from "@/components/layout/page-heading";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  DataTable,
  type DataTableQueryState,
} from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import { NumericCell } from "@/components/ui/numeric-cell";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchCCTVEvents } from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api-client";

export default function CCTVEventsReportPage() {
  const [severity, setSeverity] = useState("all");
  const [startDate, setStartDate] = useState(
    format(subDays(new Date(), 6), "yyyy-MM-dd"),
  );
  const [endDate, setEndDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [queryState, setQueryState] = useState<DataTableQueryState>({
    mode: "paginated",
    page: 1,
    pageSize: 25,
    search: "",
  });

  const { data, isLoading, error } = useQuery({
    queryKey: [
      "cctv-events",
      "reports",
      severity,
      startDate,
      endDate,
      queryState.search,
    ],
    queryFn: () =>
      fetchCCTVEvents({
        severity: severity === "all" ? undefined : severity,
        startDate,
        endDate,
        search: queryState.search?.trim() || undefined,
        limit: 500,
      }),
  });

  const rows = useMemo(() => data?.data ?? [], [data]);
  const columns = useMemo<ColumnDef<(typeof rows)[number]>[]>(
    () => [
      {
        id: "eventTime",
        header: "Event Time",
        accessorFn: (row) => row.eventTime,
        cell: ({ row }) => (
          <NumericCell align="left">
            {format(new Date(row.original.eventTime), "MMM d, yyyy HH:mm")}
          </NumericCell>
        ),
        size: 128,
        minSize: 128,
        maxSize: 128,
      },
      {
        id: "type",
        header: "Type",
        accessorFn: (row) => row.eventType,
        cell: ({ row }) => row.original.eventType,
        size: 160,
        minSize: 160,
        maxSize: 160,
      },
      {
        id: "severity",
        header: "Severity",
        accessorFn: (row) => row.severity,
        cell: ({ row }) => (
          <Badge
            variant={
              row.original.severity === "HIGH" ||
              row.original.severity === "CRITICAL"
                ? "destructive"
                : "secondary"
            }
          >
            {row.original.severity}
          </Badge>
        ),
        size: 160,
        minSize: 160,
        maxSize: 160,
      },
      {
        id: "title",
        header: "Title",
        accessorFn: (row) => row.title,
        cell: ({ row }) => row.original.title,
        size: 280,
        minSize: 220,
        maxSize: 420,
      },
      {
        id: "camera",
        header: "Camera",
        accessorFn: (row) => row.camera?.name ?? "",
        cell: ({ row }) => row.original.camera?.name ?? "-",
        size: 160,
        minSize: 160,
        maxSize: 160,
      },
      {
        id: "site",
        header: "Site",
        accessorFn: (row) => row.camera?.site?.name ?? "",
        cell: ({ row }) => row.original.camera?.site?.name ?? "-",
        size: 160,
        minSize: 160,
        maxSize: 160,
      },
      {
        id: "ack",
        header: "Acknowledged",
        accessorFn: (row) => String(row.isAcknowledged),
        cell: ({ row }) => (row.original.isAcknowledged ? "Yes" : "No"),
        size: 160,
        minSize: 160,
        maxSize: 160,
      },
    ],
    [],
  );

  return (
    <div className="w-full space-y-6">
      <PageHeading
        title="CCTV Events"
        description="Security event logs from cameras"
      />

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to load CCTV events</AlertTitle>
          <AlertDescription>{getApiErrorMessage(error)}</AlertDescription>
        </Alert>
      ) : null}

      <section className="space-y-3">
        <header className="space-y-1">
          <h2 className="text-section-title text-foreground font-bold tracking-tight">
            Records
          </h2>
          <p className="text-sm text-muted-foreground">
            {rows.length} CCTV events
          </p>
        </header>
        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : rows.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            No CCTV events for the selected filters.
          </div>
        ) : (
          <DataTable
            data={rows}
            columns={columns}
            queryState={queryState}
            onQueryStateChange={(next) =>
              setQueryState((prev) => ({ ...prev, ...next }))
            }
            searchPlaceholder="Search event type, title, camera"
            searchSubmitLabel="Search"
            tableClassName="text-sm"
            pagination={{ enabled: true }}
            toolbar={
              <>
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
