"use client";

import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useQuery } from "@tanstack/react-query";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";
import { NumericCell } from "@/components/ui/numeric-cell";
import { VerticalDataViews } from "@/components/ui/vertical-data-views";
import { getApiErrorMessage } from "@/lib/api-client";
import {
  fetchSchoolsBoardingLeaveRequests,
  fetchSchoolsBoardingData,
  type SchoolsBoardingLeaveRequestData,
  type SchoolsBoardingData,
} from "@/lib/schools/schools-v2";

type BoardingView = "allocations" | "hostels" | "leaveRequests";

function formatDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toISOString().slice(0, 10);
}

function allocationStatusBadge(status: string) {
  if (status === "ACTIVE") return <Badge variant="secondary">Active</Badge>;
  if (status === "TRANSFERRED") return <Badge variant="outline">Transferred</Badge>;
  if (status === "ENDED") return <Badge variant="outline">Ended</Badge>;
  return <Badge variant="outline">{status}</Badge>;
}

export function SchoolsBoardingContent() {
  const [activeView, setActiveView] = useState<BoardingView>("allocations");

  const query = useQuery({
    queryKey: ["schools", "boarding", "dashboard"],
    queryFn: () => fetchSchoolsBoardingData({ page: 1, limit: 200 }),
  });
  const leaveRequestsQuery = useQuery({
    queryKey: ["schools", "boarding", "leave-requests"],
    queryFn: () => fetchSchoolsBoardingLeaveRequests({ page: 1, limit: 200 }),
  });

  const allocationsRows = useMemo(() => query.data?.data ?? [], [query.data]);
  const hostelsRows = useMemo(() => query.data?.hostels ?? [], [query.data]);
  const leaveRequestRows = useMemo(
    () => leaveRequestsQuery.data?.data ?? [],
    [leaveRequestsQuery.data],
  );

  const allocationColumns = useMemo<
    ColumnDef<SchoolsBoardingData["data"][number]>[]
  >(
    () => [
      {
        id: "student",
        header: "Student",
        cell: ({ row }) => (
          <div>
            <div className="font-medium">
              {row.original.student.firstName} {row.original.student.lastName}
            </div>
            <div className="text-xs text-muted-foreground font-mono">
              {row.original.student.studentNo}
            </div>
          </div>
        ),
      },
      {
        id: "location",
        header: "Hostel / Room / Bed",
        cell: ({ row }) => (
          <div>
            <div>{row.original.hostel.name}</div>
            <div className="text-xs text-muted-foreground font-mono">
              {row.original.room?.code ?? "-"} / {row.original.bed?.code ?? "-"}
            </div>
          </div>
        ),
      },
      {
        id: "term",
        header: "Term",
        cell: ({ row }) => row.original.term.name,
      },
      {
        id: "status",
        header: "Status",
        cell: ({ row }) => allocationStatusBadge(row.original.status),
      },
      {
        id: "start",
        header: "Start",
        cell: ({ row }) => <NumericCell>{formatDate(row.original.startDate)}</NumericCell>,
      },
      {
        id: "end",
        header: "End",
        cell: ({ row }) => <NumericCell>{formatDate(row.original.endDate)}</NumericCell>,
      },
    ],
    [],
  );

  const hostelColumns = useMemo<
    ColumnDef<SchoolsBoardingData["hostels"][number]>[]
  >(
    () => [
      {
        id: "code",
        header: "Code",
        cell: ({ row }) => <NumericCell align="left">{row.original.code}</NumericCell>,
      },
      {
        id: "name",
        header: "Hostel",
        cell: ({ row }) => (
          <div>
            <div className="font-medium">{row.original.name}</div>
            <div className="text-xs text-muted-foreground">{row.original.genderPolicy}</div>
          </div>
        ),
      },
      {
        id: "rooms",
        header: "Rooms",
        cell: ({ row }) => <NumericCell>{row.original._count.rooms}</NumericCell>,
      },
      {
        id: "beds",
        header: "Beds",
        cell: ({ row }) => <NumericCell>{row.original._count.beds}</NumericCell>,
      },
      {
        id: "allocations",
        header: "Allocations",
        cell: ({ row }) => <NumericCell>{row.original._count.allocations}</NumericCell>,
      },
      {
        id: "active",
        header: "Status",
        cell: ({ row }) =>
          row.original.isActive ? (
            <Badge variant="secondary">Active</Badge>
          ) : (
            <Badge variant="outline">Inactive</Badge>
          ),
      },
    ],
    [],
  );

  const leaveRequestColumns = useMemo<
    ColumnDef<SchoolsBoardingLeaveRequestData["data"][number]>[]
  >(
    () => [
      {
        id: "student",
        header: "Student",
        cell: ({ row }) => (
          <div>
            <div className="font-medium">
              {row.original.student.firstName} {row.original.student.lastName}
            </div>
            <div className="text-xs text-muted-foreground font-mono">
              {row.original.student.studentNo}
            </div>
          </div>
        ),
      },
      {
        id: "requestType",
        header: "Type",
        cell: ({ row }) => (
          <Badge variant={row.original.requestType === "LEAVE" ? "secondary" : "outline"}>
            {row.original.requestType}
          </Badge>
        ),
      },
      {
        id: "window",
        header: "Window",
        cell: ({ row }) => (
          <div>
            <div className="font-mono text-xs">{formatDate(row.original.startDateTime)}</div>
            <div className="font-mono text-xs text-muted-foreground">
              {formatDate(row.original.endDateTime)}
            </div>
          </div>
        ),
      },
      {
        id: "destination",
        header: "Destination",
        cell: ({ row }) => (
          <div>
            <div>{row.original.destination}</div>
            <div className="text-xs text-muted-foreground">{row.original.guardianContact}</div>
          </div>
        ),
      },
      {
        id: "status",
        header: "Status",
        cell: ({ row }) => {
          if (row.original.status === "APPROVED" || row.original.status === "CHECKED_IN") {
            return <Badge variant="secondary">{row.original.status}</Badge>;
          }
          if (row.original.status === "REJECTED" || row.original.status === "CANCELED") {
            return <Badge variant="destructive">{row.original.status}</Badge>;
          }
          return <Badge variant="outline">{row.original.status}</Badge>;
        },
      },
      {
        id: "logs",
        header: "Movement Logs",
        cell: ({ row }) => <NumericCell>{row.original.movementLogs.length}</NumericCell>,
      },
    ],
    [],
  );

  const summary = query.data?.summary;
  const hasError = query.error || leaveRequestsQuery.error;

  return (
    <div className="space-y-4">
      {hasError ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to load boarding data</AlertTitle>
          <AlertDescription>
            {getApiErrorMessage(query.error || leaveRequestsQuery.error)}
          </AlertDescription>
        </Alert>
      ) : null}

      <section className="section-shell grid gap-2 md:grid-cols-5">
        <div>
          <h2 className="text-sm font-semibold">Active Allocations</h2>
          <p className="font-mono tabular-nums">{summary?.activeAllocations ?? 0}</p>
        </div>
        <div>
          <h2 className="text-sm font-semibold">Total Allocations</h2>
          <p className="font-mono tabular-nums">{summary?.totalAllocations ?? 0}</p>
        </div>
        <div>
          <h2 className="text-sm font-semibold">Hostels</h2>
          <p className="font-mono tabular-nums">{summary?.hostels ?? 0}</p>
        </div>
        <div>
          <h2 className="text-sm font-semibold">Rooms</h2>
          <p className="font-mono tabular-nums">{summary?.rooms ?? 0}</p>
        </div>
        <div>
          <h2 className="text-sm font-semibold">Beds</h2>
          <p className="font-mono tabular-nums">{summary?.beds ?? 0}</p>
        </div>
      </section>

      <VerticalDataViews
        items={[
          { id: "allocations", label: "Allocations", count: allocationsRows.length },
          { id: "hostels", label: "Hostels", count: hostelsRows.length },
          {
            id: "leaveRequests",
            label: "Leave / Outing Requests",
            count: leaveRequestRows.length,
          },
        ]}
        value={activeView}
        onValueChange={(value) => setActiveView(value as BoardingView)}
        railLabel="Boarding Views"
      >
        <div className={activeView === "allocations" ? "space-y-2" : "hidden"}>
          <h2 className="text-section-title">Boarding Allocations</h2>
          <DataTable
            data={allocationsRows}
            columns={allocationColumns}
            searchPlaceholder="Search allocations"
            searchSubmitLabel="Search"
            pagination={{ enabled: true }}
            emptyState={query.isLoading ? "Loading allocations..." : "No allocations available."}
          />
        </div>
        <div className={activeView === "hostels" ? "space-y-2" : "hidden"}>
          <h2 className="text-section-title">Hostel Capacity</h2>
          <DataTable
            data={hostelsRows}
            columns={hostelColumns}
            searchPlaceholder="Search hostels"
            searchSubmitLabel="Search"
            pagination={{ enabled: true }}
            emptyState={query.isLoading ? "Loading hostels..." : "No hostels available."}
          />
        </div>
        <div className={activeView === "leaveRequests" ? "space-y-2" : "hidden"}>
          <h2 className="text-section-title">Leave and Outing Workflow</h2>
          <DataTable
            data={leaveRequestRows}
            columns={leaveRequestColumns}
            searchPlaceholder="Search leave requests"
            searchSubmitLabel="Search"
            pagination={{ enabled: true }}
            emptyState={
              leaveRequestsQuery.isLoading
                ? "Loading leave requests..."
                : "No leave requests available."
            }
          />
        </div>
      </VerticalDataViews>
    </div>
  );
}
