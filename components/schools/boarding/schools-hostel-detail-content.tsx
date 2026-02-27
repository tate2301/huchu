"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { useQuery } from "@tanstack/react-query";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";
import { NumericCell } from "@/components/ui/numeric-cell";
import { VerticalDataViews } from "@/components/ui/vertical-data-views";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { fetchHostelDetail, type HostelDetail } from "@/lib/schools/admin-v2";

type HostelDetailView = "rooms" | "allocations" | "leaveRequests";

type RoomRow = HostelDetail["rooms"][number];
type BedRow = RoomRow["beds"][number];
type AllocationRow = HostelDetail["allocations"][number];

type LeaveRequestRow = {
  id: string;
  requestType: "LEAVE" | "OUTING";
  status: string;
  startDateTime: string;
  endDateTime: string;
  destination: string;
  guardianContact: string;
  student: {
    id: string;
    studentNo: string;
    firstName: string;
    lastName: string;
  };
};

function formatDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toISOString().slice(0, 10);
}

function genderPolicyBadge(policy: string) {
  if (policy === "BOYS") return <Badge variant="secondary">Boys</Badge>;
  if (policy === "GIRLS") return <Badge variant="secondary">Girls</Badge>;
  if (policy === "MIXED") return <Badge variant="outline">Mixed</Badge>;
  return <Badge variant="outline">{policy}</Badge>;
}

function allocationStatusBadge(status: string) {
  if (status === "ACTIVE") return <Badge variant="secondary">Active</Badge>;
  if (status === "TRANSFERRED") return <Badge variant="outline">Transferred</Badge>;
  if (status === "ENDED") return <Badge variant="outline">Ended</Badge>;
  return <Badge variant="outline">{status}</Badge>;
}

export function SchoolsHostelDetailContent({ hostelId }: { hostelId: string }) {
  const [activeView, setActiveView] = useState<HostelDetailView>("rooms");

  const hostelQuery = useQuery({
    queryKey: ["schools", "boarding", "hostels", hostelId],
    queryFn: () => fetchHostelDetail(hostelId),
  });

  const leaveRequestsQuery = useQuery({
    queryKey: ["schools", "boarding", "hostels", hostelId, "leave-requests"],
    queryFn: () =>
      fetchJson<{ success: boolean; data: { data: LeaveRequestRow[] } }>(
        `/api/v2/schools/boarding/leave-requests?hostelId=${hostelId}&page=1&limit=200`,
      ).then((res) => res.data.data),
  });

  const hostel = hostelQuery.data;
  const rooms = useMemo(() => hostel?.rooms ?? [], [hostel]);
  const allocations = useMemo(() => hostel?.allocations ?? [], [hostel]);
  const leaveRequests = useMemo(() => leaveRequestsQuery.data ?? [], [leaveRequestsQuery.data]);

  const roomColumns = useMemo<ColumnDef<RoomRow>[]>(
    () => [
      {
        id: "code",
        header: "Room",
        cell: ({ row }) => <span className="font-medium">{row.original.code}</span>,
      },
      {
        id: "floor",
        header: "Floor",
        cell: ({ row }) => row.original.floor ?? "-",
      },
      {
        id: "capacity",
        header: "Capacity",
        cell: ({ row }) => <NumericCell>{row.original.capacity ?? "-"}</NumericCell>,
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
        id: "status",
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

  const bedColumns = useMemo<ColumnDef<BedRow>[]>(
    () => [
      {
        id: "code",
        header: "Bed Code",
        cell: ({ row }) => <span className="font-medium font-mono">{row.original.code}</span>,
      },
      {
        id: "status",
        header: "Status",
        cell: ({ row }) =>
          row.original.status === "OCCUPIED" ? (
            <Badge variant="secondary">Occupied</Badge>
          ) : (
            <Badge variant="outline">{row.original.status}</Badge>
          ),
      },
      {
        id: "active",
        header: "Active",
        cell: ({ row }) =>
          row.original.isActive ? (
            <Badge variant="secondary">Yes</Badge>
          ) : (
            <Badge variant="outline">No</Badge>
          ),
      },
    ],
    [],
  );

  const allocationColumns = useMemo<ColumnDef<AllocationRow>[]>(
    () => [
      {
        id: "student",
        header: "Student",
        cell: ({ row }) => (
          <Link
            href={`/schools/students/${row.original.student.id}`}
            className="font-medium text-primary hover:underline"
          >
            {row.original.student.firstName} {row.original.student.lastName}
            <div className="text-xs text-muted-foreground font-mono">
              {row.original.student.studentNo}
            </div>
          </Link>
        ),
      },
      {
        id: "room",
        header: "Room",
        cell: ({ row }) => (
          <span className="font-mono">{row.original.room?.code ?? "-"}</span>
        ),
      },
      {
        id: "bed",
        header: "Bed",
        cell: ({ row }) => (
          <span className="font-mono">{row.original.bed?.code ?? "-"}</span>
        ),
      },
      {
        id: "term",
        header: "Term",
        cell: ({ row }) => row.original.term?.name ?? "-",
      },
      {
        id: "status",
        header: "Status",
        cell: ({ row }) => allocationStatusBadge(row.original.status),
      },
      {
        id: "start",
        header: "Start",
        cell: ({ row }) => (
          <NumericCell>{formatDate(row.original.startDate)}</NumericCell>
        ),
      },
      {
        id: "end",
        header: "End",
        cell: ({ row }) => (
          <NumericCell>{formatDate(row.original.endDate)}</NumericCell>
        ),
      },
    ],
    [],
  );

  const leaveRequestColumns = useMemo<ColumnDef<LeaveRequestRow>[]>(
    () => [
      {
        id: "student",
        header: "Student",
        cell: ({ row }) => (
          <Link
            href={`/schools/students/${row.original.student.id}`}
            className="font-medium text-primary hover:underline"
          >
            {row.original.student.firstName} {row.original.student.lastName}
            <div className="text-xs text-muted-foreground font-mono">
              {row.original.student.studentNo}
            </div>
          </Link>
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
    ],
    [],
  );

  const hasError = hostelQuery.error || leaveRequestsQuery.error;

  return (
    <div className="space-y-4">
      {hostel ? (
        <div className="flex items-center gap-4 flex-wrap">
          <div>
            <h2 className="text-lg font-semibold">{hostel.name}</h2>
            <p className="text-sm text-muted-foreground">
              Code: <span className="font-mono">{hostel.code}</span>
            </p>
          </div>
          {genderPolicyBadge(hostel.genderPolicy)}
          <div className="flex gap-4 text-sm text-muted-foreground">
            {hostel.capacity != null ? (
              <span>Capacity: <span className="font-mono">{hostel.capacity}</span></span>
            ) : null}
            <span>Rooms: <span className="font-mono">{hostel._count.rooms}</span></span>
            <span>Beds: <span className="font-mono">{hostel._count.beds}</span></span>
          </div>
        </div>
      ) : null}

      {hasError ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to load hostel details</AlertTitle>
          <AlertDescription>
            {getApiErrorMessage(hostelQuery.error || leaveRequestsQuery.error)}
          </AlertDescription>
        </Alert>
      ) : null}

      <VerticalDataViews
        items={[
          { id: "rooms", label: "Rooms & Beds", count: rooms.length },
          { id: "allocations", label: "Current Allocations", count: allocations.length },
          {
            id: "leaveRequests",
            label: "Leave Requests",
            count: leaveRequests.length,
          },
        ]}
        value={activeView}
        onValueChange={(value) => setActiveView(value as HostelDetailView)}
        railLabel="Hostel Views"
      >
        <div className={activeView === "rooms" ? "space-y-2" : "hidden"}>
          <h2 className="text-section-title">Rooms & Beds</h2>
          <DataTable
            data={rooms}
            columns={roomColumns}
            searchPlaceholder="Search rooms"
            searchSubmitLabel="Search"
            pagination={{ enabled: true }}
            emptyState={
              hostelQuery.isLoading ? "Loading rooms..." : "No rooms in this hostel."
            }
            expansion={{
              enabled: true,
              mode: "single",
              getRowId: (row) => row.id,
              renderExpandedContent: ({ row }) => (
                <div className="px-4 py-2">
                  <h3 className="text-sm font-semibold mb-2">
                    Beds in {row.code}
                  </h3>
                  {row.beds.length > 0 ? (
                    <DataTable
                      data={row.beds}
                      columns={bedColumns}
                      pagination={{ enabled: false }}
                      emptyState="No beds."
                    />
                  ) : (
                    <p className="text-sm text-muted-foreground">No beds configured for this room.</p>
                  )}
                </div>
              ),
            }}
          />
        </div>

        <div className={activeView === "allocations" ? "space-y-2" : "hidden"}>
          <h2 className="text-section-title">Current Allocations</h2>
          <DataTable
            data={allocations}
            columns={allocationColumns}
            searchPlaceholder="Search allocations"
            searchSubmitLabel="Search"
            pagination={{ enabled: true }}
            emptyState={
              hostelQuery.isLoading
                ? "Loading allocations..."
                : "No active allocations in this hostel."
            }
          />
        </div>

        <div className={activeView === "leaveRequests" ? "space-y-2" : "hidden"}>
          <h2 className="text-section-title">Leave Requests</h2>
          <DataTable
            data={leaveRequests}
            columns={leaveRequestColumns}
            searchPlaceholder="Search leave requests"
            searchSubmitLabel="Search"
            pagination={{ enabled: true }}
            emptyState={
              leaveRequestsQuery.isLoading
                ? "Loading leave requests..."
                : "No leave requests for this hostel."
            }
          />
        </div>
      </VerticalDataViews>
    </div>
  );
}
