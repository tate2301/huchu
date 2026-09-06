"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge, Button, Card, StatCard } from "@corelithzw/react";

import { PageChrome } from "@corelithzw/ui/layout/page-chrome";
import { PageBand } from "@/components/schools/common/page-band";
import { ClassFilter, ALL_CLASSES, type ClassFilterValue } from "@/components/schools/common/class-filter";
import { FilterSelect } from "@/components/schools/common/filter-select";
import { PersonAvatar } from "@/components/schools/common/person-avatar";
import { CreateButton, RecordActions, type RecordVerb } from "@/components/schools/common/record-actions";
import {
  LoadError,
  NothingMatched,
  NothingYet,
  SaveError,
  StatsSkeleton,
  TableRowsSkeleton,
} from "@/components/schools/common/states";
import { TableControls, TableSearch } from "@/components/schools/common/table-controls";
import { DataTable } from "@corelithzw/ui/components/data-table";
import { NumericCell } from "@corelithzw/ui/components/numeric-cell";
import { fetchJson } from "@corelithzw/platform/api-client";

import {
  ALLOCATION_STATUSES,
  allocationStatusLabel,
  allocationTone,
  bedLocation,
  fetchBoardingDashboard,
  fetchLeaveRequests,
  shortDate,
  type AllocationStatus,
  type BoardingAllocation,
} from "@/components/schools/boarding/boarding-data";
import { AllocateBedDialog, AllocationDialog } from "@/components/schools/boarding/boarding-dialogs";
import { BoardingViews } from "@/components/schools/boarding/boarding-views";
import { LeaveRequestsPanel } from "@/components/schools/boarding/leave-requests-panel";

/**
 * Boarding Management — who is in which bed, this term.
 *
 * Two cards, in the order the canvas draws them. The allocations table is the
 * screen; the leave and outing table under it is there because a warden reading
 * the bed list is one question away from "and who is out of the gate", and
 * making that a second navigation is making them hold the first answer in their
 * head while they go and find the second.
 *
 * `Hostel / Room / Bed` is one column rather than three. It is an address — the
 * thing somebody reads out over the phone — and splitting it makes the reader
 * reassemble it every row.
 *
 * The whole-school view is the default and the class is a filter on it, not a
 * gate. A warden asking "who is boarding" wants the house, then Form 3, then
 * the house again.
 */
export function BoardingAllocationsContent() {
  const queryClient = useQueryClient();

  const [hostelFilter, setHostelFilter] = useState("");
  const [classValue, setClassValue] = useState<ClassFilterValue>(ALL_CLASSES);
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [allocating, setAllocating] = useState(false);
  const [editing, setEditing] = useState<BoardingAllocation | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const boardQuery = useQuery({
    queryKey: ["schools", "boarding", "dashboard", hostelFilter, status],
    queryFn: () =>
      fetchBoardingDashboard({
        ...(hostelFilter ? { hostelId: hostelFilter } : {}),
        ...(status ? { status: status as AllocationStatus } : {}),
      }),
  });

  // The leave card counts what it holds, so it reads the same list the panel
  // does rather than guessing at it from the allocations.
  const leaveQuery = useQuery({
    queryKey: ["schools", "boarding", "leave-requests", hostelFilter, "", ""],
    queryFn: () =>
      fetchLeaveRequests(hostelFilter ? { hostelId: hostelFilter } : {}),
  });

  const hostels = useMemo(() => boardQuery.data?.hostels ?? [], [boardQuery.data]);
  const summary = boardQuery.data?.summary;

  // Year group and the name search are not queries the boarding endpoint takes
  // — an allocation knows a house, not a class — so both are applied here.
  const allocations = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (boardQuery.data?.data ?? []).filter((row) => {
      if (classValue.classId && row.student.currentClass?.id !== classValue.classId) {
        return false;
      }
      if (!needle) return true;
      return `${row.student.lastName} ${row.student.firstName} ${row.student.studentNo}`
        .toLowerCase()
        .includes(needle);
    });
  }, [boardQuery.data, classValue.classId, search]);

  const allocationAction = useMutation({
    mutationFn: (input: { id: string; body?: Record<string, unknown>; remove?: boolean }) =>
      fetchJson(`/api/v2/schools/boarding/allocations/${input.id}`, {
        method: input.remove ? "DELETE" : "PATCH",
        ...(input.remove ? {} : { body: JSON.stringify(input.body ?? {}) }),
      }),
    onSettled: () => setPendingId(null),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["schools", "boarding"] });
    },
  });

  const columns = useMemo<ColumnDef<BoardingAllocation>[]>(
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
          <Link
            href={`/schools/boarding/hostels?hostel=${row.original.hostel.id}`}
            className="hover:underline"
          >
            {bedLocation(row.original)}
          </Link>
        ),
      },
      {
        id: "term",
        header: "Term",
        cell: ({ row }) => (
          <NumericCell align="left">{row.original.term.code}</NumericCell>
        ),
      },
      {
        id: "status",
        header: "Status",
        cell: ({ row }) => (
          <Badge tone={allocationTone(row.original.status)}>
            {allocationStatusLabel(row.original.status)}
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
              onSelect: () => setEditing(allocation),
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
                allocationAction.mutate({ id: allocation.id, body: { status: "ENDED" } });
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

  const activeTerm = boardQuery.data?.data?.find((row) => row.term.isActive)?.term ?? null;
  const beds = summary?.beds ?? 0;
  const taken = summary?.activeAllocations ?? 0;
  const leaveRequests = leaveQuery.data ?? [];
  const waiting = leaveRequests.filter((row) => row.status === "SUBMITTED").length;
  const out = leaveRequests.filter((row) => row.status === "CHECKED_OUT").length;

  const filterNames = [
    hostels.find((hostel) => hostel.id === hostelFilter)?.name,
    status ? allocationStatusLabel(status as AllocationStatus) : null,
    search.trim() || null,
  ].filter((name): name is string => Boolean(name));

  const clearFilters = () => {
    setHostelFilter("");
    setClassValue(ALL_CLASSES);
    setStatus("");
    setSearch("");
  };

  return (
    <>
      <PageChrome title="Boarding Management">
        <CreateButton
          resource="schools.boarding"
          action="allocate-bed"
          label="Allocate a bed"
          onSelect={() => setAllocating(true)}
          unavailable={
            hostels.length === 0 ? "There is no hostel to put anybody in." : undefined
          }
        />
      </PageChrome>

      <PageBand
        chips={[
          { label: "Term", value: activeTerm?.code ?? "—" },
          { label: "Beds", value: `${taken} of ${beds}`, tone: "brand" },
          { label: "Waiting on you", value: waiting, tone: waiting > 0 ? "warn" : "neutral" },
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

      {boardQuery.isLoading ? (
        <StatsSkeleton count={5} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <StatCard label="Active Allocations" value={summary?.activeAllocations ?? 0} />
          <StatCard label="Total Allocations" value={summary?.totalAllocations ?? 0} />
          <StatCard label="Hostels" value={summary?.hostels ?? 0} />
          <StatCard label="Rooms" value={summary?.rooms ?? 0} />
          <StatCard label="Beds" value={summary?.beds ?? 0} />
        </div>
      )}

      <TableControls
        tabs={
          <BoardingViews
            allocations={summary?.totalAllocations}
            hostels={summary?.hostels}
            leave={leaveRequests.length}
          />
        }
        search={
          <TableSearch
            value={search}
            onChange={setSearch}
            placeholder="Search allocations"
          />
        }
        filters={
          <>
            <FilterSelect
              label="Hostel"
              allLabel="Every hostel"
              value={hostelFilter}
              options={hostels.map((hostel) => ({ value: hostel.id, label: hostel.name }))}
              onChange={setHostelFilter}
            />
            <ClassFilter label="Year group" value={classValue} onChange={setClassValue} />
            <FilterSelect
              label="Status"
              allLabel="Every status"
              value={status}
              options={ALLOCATION_STATUSES}
              onChange={setStatus}
            />
          </>
        }
      />

      <Card flush title="Boarding Allocations" subtitle={`${allocations.length} on the board`}>
        {boardQuery.isLoading ? (
          <TableRowsSkeleton
            columns={[
              { avatar: true, twoLine: true },
              {},
              { width: 70 },
              { width: 100 },
              { width: 70 },
              { width: 70 },
              { width: 220 },
            ]}
          />
        ) : (
          <DataTable
            data={allocations}
            columns={columns}
            searchPlaceholder="Search allocations"
            searchSubmitLabel="Search"
            pagination={{ enabled: true }}
            emptyState={
              hostels.length === 0 ? (
                <NothingYet
                  title="No beds have been given out"
                  body="A boarding house, its rooms and its beds come first; after that this is where the term's allocations live."
                  action={
                    <Button asChild variant="secondary">
                      <Link href="/schools/boarding/hostels">Open hostels</Link>
                    </Button>
                  }
                />
              ) : filterNames.length > 0 || classValue.classId ? (
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
      </Card>

      <Card
        flush
        title="Leave and Outing Workflow"
        subtitle="the other view"
        actions={
          <Button asChild variant="secondary" size="sm">
            <Link href="/schools/boarding/leave">Open leave and outings</Link>
          </Button>
        }
      >
        <LeaveRequestsPanel
          requests={leaveQuery.data}
          filters={{ hostelId: hostelFilter, classId: classValue.classId }}
          filterNames={filterNames}
          onClearFilters={clearFilters}
        />
      </Card>

      <AllocateBedDialog
        open={allocating}
        hostels={hostels}
        defaultHostelId={hostelFilter || undefined}
        onClose={() => setAllocating(false)}
      />
      <AllocationDialog
        open={editing !== null}
        allocation={editing}
        onClose={() => setEditing(null)}
      />
    </>
  );
}
