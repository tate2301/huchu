"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge, StatCard } from "@corelithzw/react";

import { PageHeading } from "@/components/layout/page-heading";
import { PageBand } from "@/components/schools/common/page-band";
import { FilterBar, FilterSelect } from "@/components/schools/common/filter-select";
import { PersonAvatar } from "@/components/schools/common/person-avatar";
import {
  CreateButton,
  RecordActions,
  type RecordVerb,
} from "@/components/schools/common/record-actions";
import {
  LoadError,
  NothingMatched,
  NothingYet,
  SaveError,
  StatsSkeleton,
  TableRowsSkeleton,
} from "@/components/schools/common/states";
import { DataTable } from "@/components/ui/data-table";
import { NumericCell } from "@/components/ui/numeric-cell";
import { VerticalDataViews } from "@/components/ui/vertical-data-views";
import { fetchJson } from "@/lib/api-client";
import { fetchSchoolsClasses } from "@/lib/schools/admin-v2";

import {
  ALLOCATION_STATUSES,
  LEAVE_STATUSES,
  fetchBoardingDashboard,
  fetchLeaveRequests,
  genderPolicyLabel,
  leaveStatusLabel,
  type AllocationStatus,
  type BoardingAllocation,
  type BoardingHostel,
  type LeaveRequest,
  type LeaveStatus,
} from "./boarding-data";
import {
  AllocateBedDialog,
  AllocationDialog,
  HostelDialog,
  LeaveRequestDialog,
} from "./boarding-dialogs";

type BoardingView = "allocations" | "hostels" | "leaveRequests";

/** `4 May`. The board is read a term at a time, so the year is noise. */
const SHORT_DATE = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });

function shortDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return SHORT_DATE.format(date);
}

/** `29 Aug – 1 Sep`, collapsed to one date when leave starts and ends the same day. */
function dateWindow(start: string, end: string) {
  const from = shortDate(start);
  const to = shortDate(end);
  return from === to ? from : `${from} – ${to}`;
}

function allocationTone(status: AllocationStatus) {
  if (status === "ACTIVE") return "success" as const;
  if (status === "TRANSFERRED") return "info" as const;
  return "neutral" as const;
}

function leaveTone(status: LeaveStatus) {
  if (status === "APPROVED" || status === "CHECKED_IN") return "success" as const;
  if (status === "CHECKED_OUT") return "warn" as const;
  if (status === "REJECTED" || status === "CANCELED") return "danger" as const;
  return "neutral" as const;
}

/**
 * The boarding board.
 *
 * Three cuts of one thing — who is in a bed, what the houses hold, and who is
 * out of the gate — and every row now carries the verb that changes it. Before
 * this the page was three read-only tables: a warden could see that Tanaka was
 * in bed B3 of room 12 and had no way from that screen to move her, end her
 * allocation, or approve the leave request sitting in the third tab.
 *
 * The bed board itself lives on the hostel record page, because a bed belongs
 * to a room and a room belongs to a house; this screen is the school-wide view
 * that tells you which house to open.
 */
export function SchoolsBoardingContent() {
  const queryClient = useQueryClient();
  const [view, setView] = useState<BoardingView>("allocations");

  const [hostelFilter, setHostelFilter] = useState("");
  const [classFilter, setClassFilter] = useState("");
  const [allocationStatus, setAllocationStatus] = useState("");
  const [leaveStatus, setLeaveStatus] = useState("");
  const [leaveType, setLeaveType] = useState("");
  const [hostelState, setHostelState] = useState("");

  const [allocating, setAllocating] = useState(false);
  const [editingAllocation, setEditingAllocation] = useState<BoardingAllocation | null>(
    null,
  );
  const [editingHostel, setEditingHostel] = useState<BoardingHostel | null>(null);
  const [addingHostel, setAddingHostel] = useState(false);
  const [editingLeave, setEditingLeave] = useState<LeaveRequest | null>(null);
  const [addingLeave, setAddingLeave] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const boardQuery = useQuery({
    queryKey: ["schools", "boarding", "dashboard", hostelFilter, allocationStatus],
    queryFn: () =>
      fetchBoardingDashboard({
        ...(hostelFilter ? { hostelId: hostelFilter } : {}),
        ...(allocationStatus ? { status: allocationStatus as AllocationStatus } : {}),
      }),
  });

  const leaveQuery = useQuery({
    queryKey: ["schools", "boarding", "leave-requests", hostelFilter, leaveStatus, leaveType],
    queryFn: () =>
      fetchLeaveRequests({
        ...(hostelFilter ? { hostelId: hostelFilter } : {}),
        ...(leaveStatus ? { status: leaveStatus as LeaveStatus } : {}),
        ...(leaveType ? { requestType: leaveType as "LEAVE" | "OUTING" } : {}),
      }),
  });

  const classesQuery = useQuery({
    queryKey: ["schools", "grades"],
    queryFn: () => fetchSchoolsClasses({ page: 1, limit: 200 }),
  });

  const hostels = useMemo(() => boardQuery.data?.hostels ?? [], [boardQuery.data]);
  const summary = boardQuery.data?.summary;
  const classes = useMemo(() => classesQuery.data?.data ?? [], [classesQuery.data]);

  // Year group is not a query the boarding endpoints take — an allocation knows
  // a house, not a class — so it is applied here against the child's class.
  const allocations = useMemo(
    () =>
      (boardQuery.data?.data ?? []).filter(
        (row) => !classFilter || row.student.currentClass?.id === classFilter,
      ),
    [boardQuery.data, classFilter],
  );

  const leaveRequests = useMemo(
    () =>
      (leaveQuery.data ?? []).filter(
        (row) => !classFilter || row.student.currentClass?.id === classFilter,
      ),
    [leaveQuery.data, classFilter],
  );

  const visibleHostels = useMemo(
    () =>
      hostels.filter((hostel) => {
        if (hostelState === "open") return hostel.isActive;
        if (hostelState === "closed") return !hostel.isActive;
        return true;
      }),
    [hostels, hostelState],
  );

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["schools", "boarding"] });
  };

  const allocationAction = useMutation({
    mutationFn: (input: { id: string; body?: Record<string, unknown>; remove?: boolean }) =>
      fetchJson(`/api/v2/schools/boarding/allocations/${input.id}`, {
        method: input.remove ? "DELETE" : "PATCH",
        ...(input.remove ? {} : { body: JSON.stringify(input.body ?? {}) }),
      }),
    onSettled: () => setPendingId(null),
    onSuccess: invalidate,
  });

  const hostelAction = useMutation({
    mutationFn: (input: { id: string; body?: Record<string, unknown>; remove?: boolean }) =>
      fetchJson(`/api/v2/schools/boarding/hostels/${input.id}`, {
        method: input.remove ? "DELETE" : "PATCH",
        ...(input.remove ? {} : { body: JSON.stringify(input.body ?? {}) }),
      }),
    onSettled: () => setPendingId(null),
    onSuccess: invalidate,
  });

  const leaveAction = useMutation({
    mutationFn: (input: { id: string; step: string; body?: Record<string, unknown> }) =>
      input.step === "cancel"
        ? fetchJson(`/api/v2/schools/boarding/leave-requests/${input.id}`, {
            method: "DELETE",
          })
        : fetchJson(`/api/v2/schools/boarding/leave-requests/${input.id}/${input.step}`, {
            method: "POST",
            body: JSON.stringify(input.body ?? {}),
          }),
    onSettled: () => setPendingId(null),
    onSuccess: invalidate,
  });

  const allocationColumns = useMemo<ColumnDef<BoardingAllocation>[]>(
    () => [
      {
        id: "student",
        header: "Student",
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <PersonAvatar
              firstName={row.original.student.firstName}
              lastName={row.original.student.lastName}
            />
            <Link
              href={`/schools/students/${row.original.student.id}`}
              className="min-w-0 hover:underline"
            >
              <div className="truncate font-medium">
                {row.original.student.lastName}, {row.original.student.firstName}
              </div>
              <div className="truncate font-mono text-xs text-muted-foreground">
                {row.original.student.studentNo}
                {row.original.student.currentClass
                  ? ` · ${row.original.student.currentClass.name}`
                  : ""}
              </div>
            </Link>
          </div>
        ),
      },
      {
        id: "location",
        header: "Hostel / Room / Bed",
        cell: ({ row }) => (
          <div>
            <Link
              href={`/schools/boarding/${row.original.hostel.id}`}
              className="hover:underline"
            >
              {row.original.hostel.name}
            </Link>
            <div className="font-mono text-xs text-muted-foreground">
              {row.original.room?.code ?? "—"} / {row.original.bed?.code ?? "—"}
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
        cell: ({ row }) => (
          <Badge tone={allocationTone(row.original.status)}>
            {ALLOCATION_STATUSES.find((s) => s.value === row.original.status)?.label ??
              row.original.status}
          </Badge>
        ),
      },
      {
        id: "start",
        header: "Start",
        cell: ({ row }) => <NumericCell>{shortDate(row.original.startDate)}</NumericCell>,
      },
      {
        id: "end",
        header: "End",
        cell: ({ row }) => <NumericCell>{shortDate(row.original.endDate)}</NumericCell>,
      },
      {
        id: "verbs",
        header: "",
        cell: ({ row }) => {
          const allocation = row.original;
          const verbs: RecordVerb[] = [
            {
              label: "Edit",
              action: "allocate-bed",
              onSelect: () => setEditingAllocation(allocation),
            },
          ];
          if (allocation.status === "ACTIVE") {
            verbs.push({
              label: "Free the bed",
              action: "allocate-bed",
              tone: "warning",
              loading: pendingId === allocation.id,
              confirm: {
                title: "Free the bed",
                description: `${allocation.student.firstName} ${allocation.student.lastName} moves out of ${allocation.hostel.name}, bed ${allocation.bed?.code ?? "—"} goes back on the board, and they stop counting as a boarder if this was their only bed.`,
                confirmLabel: "Free it",
              },
              onSelect: () => {
                setPendingId(allocation.id);
                allocationAction.mutate({
                  id: allocation.id,
                  body: { status: "ENDED" },
                });
              },
            });
          }
          verbs.push({
            label: "Delete",
            action: "archive",
            tone: "danger",
            loading: pendingId === allocation.id,
            confirm: {
              title: "Delete this allocation",
              description:
                "The row goes for good, as though the child was never given this bed. Use it only for an allocation made in error — a child who left is ended, not deleted.",
              confirmLabel: "Delete it",
            },
            onSelect: () => {
              setPendingId(allocation.id);
              allocationAction.mutate({ id: allocation.id, remove: true });
            },
          });
          return <RecordActions resource="schools.boarding" verbs={verbs} />;
        },
      },
    ],
    [allocationAction, pendingId],
  );

  const hostelColumns = useMemo<ColumnDef<BoardingHostel>[]>(
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
            <Link
              href={`/schools/boarding/${row.original.id}`}
              className="font-medium hover:underline"
            >
              {row.original.name}
            </Link>
            <div className="text-xs text-muted-foreground">
              Takes {genderPolicyLabel(row.original.genderPolicy).toLowerCase()}
            </div>
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
        id: "status",
        header: "Status",
        cell: ({ row }) => (
          <Badge tone={row.original.isActive ? "success" : "neutral"}>
            {row.original.isActive ? "In use" : "Closed"}
          </Badge>
        ),
      },
      {
        id: "verbs",
        header: "",
        cell: ({ row }) => {
          const hostel = row.original;
          const verbs: RecordVerb[] = [
            { label: "Edit", action: "edit", onSelect: () => setEditingHostel(hostel) },
            {
              label: hostel.isActive ? "Close" : "Reopen",
              action: "edit",
              tone: hostel.isActive ? "warning" : "default",
              loading: pendingId === hostel.id,
              ...(hostel.isActive
                ? {
                    confirm: {
                      title: `Close ${hostel.name}`,
                      description:
                        "The house stops being offered when a bed is allocated. Everyone already in it stays where they are.",
                      confirmLabel: "Close it",
                    },
                  }
                : {}),
              onSelect: () => {
                setPendingId(hostel.id);
                hostelAction.mutate({
                  id: hostel.id,
                  body: { isActive: !hostel.isActive },
                });
              },
            },
            {
              label: "Delete",
              action: "archive",
              tone: "danger",
              loading: pendingId === hostel.id,
              unavailable:
                hostel._count.allocations > 0
                  ? "Children have boarded here. Close it instead."
                  : undefined,
              confirm: {
                title: `Delete ${hostel.name}`,
                description:
                  "The house, its rooms and its beds go for good. Only a house nobody has ever boarded in can be deleted.",
                confirmLabel: "Delete it",
              },
              onSelect: () => {
                setPendingId(hostel.id);
                hostelAction.mutate({ id: hostel.id, remove: true });
              },
            },
          ];
          return <RecordActions resource="schools.boarding" verbs={verbs} />;
        },
      },
    ],
    [hostelAction, pendingId],
  );

  const leaveColumns = useMemo<ColumnDef<LeaveRequest>[]>(
    () => [
      {
        id: "student",
        header: "Student",
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <PersonAvatar
              firstName={row.original.student.firstName}
              lastName={row.original.student.lastName}
            />
            <Link
              href={`/schools/students/${row.original.student.id}`}
              className="min-w-0 hover:underline"
            >
              <div className="truncate font-medium">
                {row.original.student.lastName}, {row.original.student.firstName}
              </div>
              <div className="truncate font-mono text-xs text-muted-foreground">
                {row.original.student.studentNo}
                {row.original.allocation
                  ? ` · ${row.original.allocation.hostel.name}`
                  : ""}
              </div>
            </Link>
          </div>
        ),
      },
      {
        id: "type",
        header: "Type",
        cell: ({ row }) => (
          <Badge tone={row.original.requestType === "LEAVE" ? "brand" : "info"}>
            {row.original.requestType === "LEAVE" ? "Leave" : "Outing"}
          </Badge>
        ),
      },
      {
        id: "window",
        header: "Window",
        cell: ({ row }) => (
          <NumericCell align="left">
            {dateWindow(row.original.startDateTime, row.original.endDateTime)}
          </NumericCell>
        ),
      },
      {
        id: "destination",
        header: "Going to",
        cell: ({ row }) => (
          <div className="min-w-0">
            <div className="truncate">{row.original.destination}</div>
            <div className="truncate text-xs text-muted-foreground">
              {row.original.guardianContact}
            </div>
          </div>
        ),
      },
      {
        id: "status",
        header: "Status",
        cell: ({ row }) => (
          <Badge tone={leaveTone(row.original.status)}>
            {leaveStatusLabel(row.original.status)}
          </Badge>
        ),
      },
      {
        id: "verbs",
        header: "",
        cell: ({ row }) => {
          const request = row.original;
          const busy = pendingId === request.id;
          const verbs: RecordVerb[] = [];

          if (request.status === "SUBMITTED") {
            verbs.push({
              label: "Approve",
              action: "approve-leave",
              loading: busy,
              onSelect: () => {
                setPendingId(request.id);
                leaveAction.mutate({
                  id: request.id,
                  step: "approve",
                  body: { approved: true },
                });
              },
            });
            verbs.push({
              label: "Refuse",
              action: "approve-leave",
              tone: "danger",
              loading: busy,
              confirm: {
                title: "Refuse this request",
                description: `${request.student.firstName} stays at school over ${dateWindow(request.startDateTime, request.endDateTime)}. The family is not told by this screen — ring them.`,
                confirmLabel: "Refuse it",
              },
              onSelect: () => {
                setPendingId(request.id);
                leaveAction.mutate({
                  id: request.id,
                  step: "approve",
                  body: { approved: false },
                });
              },
            });
          }

          if (request.status === "APPROVED") {
            verbs.push({
              label: "Sign out",
              action: "check-out",
              loading: busy,
              onSelect: () => {
                setPendingId(request.id);
                leaveAction.mutate({ id: request.id, step: "check-out", body: {} });
              },
            });
          }

          if (request.status === "CHECKED_OUT") {
            verbs.push({
              label: "Sign in",
              action: "check-in",
              loading: busy,
              onSelect: () => {
                setPendingId(request.id);
                leaveAction.mutate({ id: request.id, step: "check-in", body: {} });
              },
            });
          }

          verbs.push({
            label: "Edit",
            action: "edit",
            unavailable:
              request.status === "CHECKED_OUT" || request.status === "CHECKED_IN"
                ? "A movement that has happened cannot be edited."
                : undefined,
            onSelect: () => setEditingLeave(request),
          });

          verbs.push({
            label: "Call it off",
            action: "approve-leave",
            tone: "danger",
            loading: busy,
            unavailable:
              request.status === "CHECKED_OUT"
                ? "This child is signed out. Sign them back in first."
                : request.status === "CANCELED"
                  ? "Already called off."
                  : undefined,
            confirm: {
              title: "Call off this request",
              description:
                "The request is marked called off and stays on the list, so it is still the answer to why the child was not signed out.",
              confirmLabel: "Call it off",
            },
            onSelect: () => {
              setPendingId(request.id);
              leaveAction.mutate({ id: request.id, step: "cancel" });
            },
          });

          return <RecordActions resource="schools.boarding" verbs={verbs} />;
        },
      },
    ],
    [leaveAction, pendingId],
  );

  const beds = summary?.beds ?? 0;
  const taken = summary?.activeAllocations ?? 0;
  const activeTerm = boardQuery.data?.data?.find((row) => row.term.isActive)?.term ?? null;
  const waiting = leaveRequests.filter((row) => row.status === "SUBMITTED").length;
  const out = leaveRequests.filter((row) => row.status === "CHECKED_OUT").length;

  const filterNames = [
    hostels.find((hostel) => hostel.id === hostelFilter)?.name,
    classes.find((row) => row.id === classFilter)?.name,
  ].filter((name): name is string => Boolean(name));

  const clearFilters = () => {
    setHostelFilter("");
    setClassFilter("");
    setAllocationStatus("");
    setLeaveStatus("");
    setLeaveType("");
  };

  const primaryAction =
    view === "hostels" ? (
      <CreateButton
        resource="schools.boarding"
        label="Add a hostel"
        onSelect={() => setAddingHostel(true)}
      />
    ) : view === "leaveRequests" ? (
      <CreateButton
        resource="schools.boarding"
        action="approve-leave"
        label="Record a leave request"
        onSelect={() => setAddingLeave(true)}
      />
    ) : (
      <CreateButton
        resource="schools.boarding"
        action="allocate-bed"
        label="Allocate a bed"
        onSelect={() => setAllocating(true)}
        unavailable={hostels.length === 0 ? "There is no hostel to put anybody in." : undefined}
      />
    );

  return (
    <div className="space-y-4">
      <PageHeading title="Boarding Management" primaryAction={primaryAction} />

      <PageBand
        chips={[
          { label: "Term", value: activeTerm?.name ?? "—" },
          { label: "Beds", value: `${taken} of ${beds}`, tone: "brand" },
          {
            label: "Waiting on you",
            value: waiting,
            tone: waiting > 0 ? "warn" : "neutral",
          },
          { label: "Out of the gate", value: out, tone: out > 0 ? "warn" : "neutral" },
        ]}
      />

      {boardQuery.error ? (
        <LoadError
          what="the boarding board"
          error={boardQuery.error}
          onRetry={() => void boardQuery.refetch()}
        />
      ) : null}
      {allocationAction.error ? (
        <SaveError what="That allocation" error={allocationAction.error} />
      ) : null}
      {hostelAction.error ? (
        <SaveError what="That hostel" error={hostelAction.error} />
      ) : null}
      {leaveAction.error ? (
        <SaveError what="That leave request" error={leaveAction.error} />
      ) : null}

      {boardQuery.isLoading ? (
        <StatsSkeleton count={5} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <StatCard label="Active allocations" value={summary?.activeAllocations ?? 0} />
          <StatCard label="Total allocations" value={summary?.totalAllocations ?? 0} />
          <StatCard label="Hostels" value={summary?.hostels ?? 0} />
          <StatCard label="Rooms" value={summary?.rooms ?? 0} />
          <StatCard label="Beds" value={summary?.beds ?? 0} />
        </div>
      )}

      <VerticalDataViews
        items={[
          { id: "allocations", label: "Allocations", count: allocations.length },
          { id: "hostels", label: "Hostels", count: visibleHostels.length },
          {
            id: "leaveRequests",
            label: "Leave / Outing Requests",
            count: leaveRequests.length,
          },
        ]}
        value={view}
        onValueChange={(value) => setView(value as BoardingView)}
        railLabel="Boarding views"
      >
        <div className={view === "allocations" ? "space-y-3" : "hidden"}>
          <FilterBar>
            <FilterSelect
              label="Hostel"
              allLabel="Every hostel"
              value={hostelFilter}
              options={hostels.map((hostel) => ({
                value: hostel.id,
                label: hostel.name,
              }))}
              onChange={setHostelFilter}
            />
            <FilterSelect
              label="Year group"
              allLabel="Every year group"
              value={classFilter}
              options={classes.map((row) => ({ value: row.id, label: row.name }))}
              onChange={setClassFilter}
            />
            <FilterSelect
              label="Status"
              allLabel="Every status"
              value={allocationStatus}
              options={ALLOCATION_STATUSES}
              onChange={setAllocationStatus}
            />
          </FilterBar>

          {boardQuery.isLoading ? (
            <TableRowsSkeleton
              columns={[{ avatar: true, twoLine: true }, { twoLine: true }, { width: 90 }, { width: 90 }, { width: 70 }, { width: 70 }, { width: 220 }]}
            />
          ) : (
            <DataTable
              data={allocations}
              columns={allocationColumns}
              searchPlaceholder="Search allocations"
              searchSubmitLabel="Search"
              pagination={{ enabled: true }}
              emptyState={
                hostels.length === 0 ? (
                  <NothingYet
                    title="No beds have been given out"
                    body="A boarding house, its rooms and its beds come first; after that this is where the term's allocations live."
                  />
                ) : hostelFilter || classFilter || allocationStatus ? (
                  <NothingMatched
                    what="allocations"
                    filters={filterNames}
                    onClear={clearFilters}
                  />
                ) : (
                  <NothingYet
                    title="Nobody is in a bed yet"
                    body="Allocate a bed to start the term's boarding list."
                  />
                )
              }
            />
          )}
        </div>

        <div className={view === "hostels" ? "space-y-3" : "hidden"}>
          <FilterBar>
            <FilterSelect
              label="In use"
              allLabel="Every hostel"
              value={hostelState}
              options={[
                { value: "open", label: "Open houses" },
                { value: "closed", label: "Closed houses" },
              ]}
              onChange={setHostelState}
            />
          </FilterBar>

          {boardQuery.isLoading ? (
            <TableRowsSkeleton
              columns={[{ width: 70 }, { twoLine: true }, { width: 70 }, { width: 70 }, { width: 90 }, { width: 90 }, { width: 220 }]}
            />
          ) : (
            <DataTable
              data={visibleHostels}
              columns={hostelColumns}
              searchPlaceholder="Search hostels"
              searchSubmitLabel="Search"
              pagination={{ enabled: true }}
              emptyState={
                hostelState ? (
                  <NothingMatched
                    what="hostels"
                    filters={[hostelState === "open" ? "Open houses" : "Closed houses"]}
                    onClear={() => setHostelState("")}
                  />
                ) : (
                  <NothingYet
                    title="No boarding houses yet"
                    body="A hostel holds the rooms, the rooms hold the beds, and the beds are what a child is allocated to."
                  />
                )
              }
            />
          )}
        </div>

        <div className={view === "leaveRequests" ? "space-y-3" : "hidden"}>
          <FilterBar>
            <FilterSelect
              label="Hostel"
              allLabel="Every hostel"
              value={hostelFilter}
              options={hostels.map((hostel) => ({
                value: hostel.id,
                label: hostel.name,
              }))}
              onChange={setHostelFilter}
            />
            <FilterSelect
              label="Year group"
              allLabel="Every year group"
              value={classFilter}
              options={classes.map((row) => ({ value: row.id, label: row.name }))}
              onChange={setClassFilter}
            />
            <FilterSelect
              label="Status"
              allLabel="Every status"
              value={leaveStatus}
              options={LEAVE_STATUSES}
              onChange={setLeaveStatus}
            />
            <FilterSelect
              label="Kind"
              allLabel="Leave and outings"
              value={leaveType}
              options={[
                { value: "LEAVE", label: "Leave" },
                { value: "OUTING", label: "Outings" },
              ]}
              onChange={setLeaveType}
            />
          </FilterBar>

          {leaveQuery.isLoading ? (
            <TableRowsSkeleton
              columns={[{ avatar: true, twoLine: true }, { width: 80 }, { width: 110 }, { twoLine: true }, { width: 130 }, { width: 240 }]}
            />
          ) : (
            <DataTable
              data={leaveRequests}
              columns={leaveColumns}
              searchPlaceholder="Search leave requests"
              searchSubmitLabel="Search"
              pagination={{ enabled: true }}
              emptyState={
                hostelFilter || classFilter || leaveStatus || leaveType ? (
                  <NothingMatched
                    what="requests"
                    filters={filterNames}
                    onClear={clearFilters}
                  />
                ) : (
                  <NothingYet
                    title="Nobody has asked to go out"
                    body="Leave and outings are recorded here, approved by the warden, and signed out and back in at the gate."
                  />
                )
              }
            />
          )}
        </div>
      </VerticalDataViews>

      <HostelDialog
        open={addingHostel || editingHostel !== null}
        hostel={editingHostel}
        onClose={() => {
          setAddingHostel(false);
          setEditingHostel(null);
        }}
      />
      <AllocateBedDialog
        open={allocating}
        hostels={hostels}
        defaultHostelId={hostelFilter || undefined}
        onClose={() => setAllocating(false)}
      />
      <AllocationDialog
        open={editingAllocation !== null}
        allocation={editingAllocation}
        onClose={() => setEditingAllocation(null)}
      />
      <LeaveRequestDialog
        open={addingLeave || editingLeave !== null}
        leaveRequest={editingLeave}
        onClose={() => {
          setAddingLeave(false);
          setEditingLeave(null);
        }}
      />
    </div>
  );
}
