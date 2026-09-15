"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge, Button, Card } from "@corelithzw/react";

import { PageChrome } from "@/components/layout/page-chrome";
import { PageBand } from "@/components/schools/common/page-band";
import { ClassFilter, ALL_CLASSES, type ClassFilterValue } from "@/components/schools/common/class-filter";
import { FilterSelect } from "@/components/schools/common/filter-select";
import { PersonCell, RecordNameCell } from "@/components/schools/common/identity-cell";
import { CreateButton, RecordActions, type RecordVerb } from "@/components/schools/common/record-actions";
import {
  LoadError,
  NothingMatched,
  NothingYet,
  SaveError,
  TableRowsSkeleton,
} from "@/components/records/states";
import { TableControls, TableSearch } from "@/components/records/table-controls";
import { DataTable } from "@/components/ui/data-table";
import { NumericCell } from "@/components/ui/numeric-cell";
import { fetchJson } from "@/lib/api-client";

import {
  ALLOCATION_STATUSES,
  allocationStatusLabel,
  allocationTone,
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
 * Who is in which bed, this term.
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
          <PersonCell
            kind="student"
            href={`/schools/students/${row.original.student.id}`}
            firstName={row.original.student.firstName}
            lastName={row.original.student.lastName}
            reference={row.original.student.studentNo}
            context={row.original.student.currentClass?.name}
          />
        ),
      },
      {
        id: "location",
        header: "Hostel / room / bed",
        // One cell rather than three: where a child sleeps is an address, the
        // thing a warden reads out over the phone at nine on a Sunday night,
        // and split across columns the reader reassembles it on every row.
        //
        // The house is a record, so it takes the same cell a house takes
        // everywhere else — its tile, its name, and the room and bed as the
        // line underneath, which is the half that tells two boarders in the
        // same house apart. A plain click opens the house beside the board and
        // the warden keeps the row they were reading.
        //
        // A dash stands in for a part that is missing: an allocation to a
        // house with no bed yet is a real state, and hiding the gap makes it
        // invisible.
        cell: ({ row }) => (
          <RecordNameCell
            kind="hostel"
            href={`/schools/boarding/${row.original.hostel.id}`}
            name={row.original.hostel.name}
            reference={`${row.original.room?.code ?? "—"} / ${row.original.bed?.code ?? "—"}`}
          />
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
        // An affordance, not a field — but the head still needs the cell, or
        // every column below it shifts by one.
        header: () => <span className="sr-only">Row actions</span>,
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
          return (
            <div className="flex justify-end">
              <RecordActions
                layout="menu"
                resource="schools.boarding"
                label={`Actions for ${allocation.student.firstName} ${allocation.student.lastName}`}
                verbs={verbs}
              />
            </div>
          );
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
  ].filter((name): name is string => Boolean(name));

  const clearFilters = () => {
    setHostelFilter("");
    setClassValue(ALL_CLASSES);
    setStatus("");
    setSearch("");
  };

  return (
    <>
      <PageChrome title="Allocations">
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

      {/* Dashes, not noughts, until each query answers. "0 waiting on you" for
          the frame before the leave requests land is the chip a warden opens
          this screen to read, and it is wrong. */}
      <PageBand
        chips={[
          { label: "Term", value: activeTerm?.code ?? "—" },
          {
            label: "Beds",
            value: boardQuery.isPending ? "—" : `${taken} of ${beds}`,
            tone: "brand",
          },
          {
            label: "Waiting on you",
            value: leaveQuery.isPending ? "—" : waiting,
            tone: waiting > 0 ? "warn" : "neutral",
          },
          {
            label: "Out of the gate",
            value: leaveQuery.isPending ? "—" : out,
            tone: out > 0 ? "warn" : "neutral",
          },
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

      <TableControls
        tabs={
          <BoardingViews
            allocations={summary?.totalAllocations}
            hostels={summary?.hostels}
            leave={leaveQuery.isPending ? undefined : leaveRequests.length}
          />
        }
        search={
          <TableSearch
            value={search}
            onChange={setSearch}
            placeholder="Search name or admission number"
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
        count={
          // Against the whole register, not against the response. The house and
          // status filters are applied by the server, so reading the
          // denominator off `boardQuery` makes it agree with the numerator the
          // moment either is used — "12 of 12" on a school with three hundred
          // allocations, which is the control saying nothing precisely when it
          // is being asked something. `totalAllocations` is the unnarrowed
          // figure and is already what the tab beside it counts.
          boardQuery.isPending
            ? null
            : `${allocations.length} of ${summary?.totalAllocations ?? allocations.length}`
        }
      />

      <Card flush>
        {boardQuery.isLoading ? (
          <TableRowsSkeleton
            headers={["Student", "Hostel / room / bed", "Term", "Status", "Start", "End", ""]}
            columns={[
              { avatar: true, twoLine: true },
              {},
              { width: 70 },
              { width: 100, badge: true },
              { width: 80 },
              { width: 80 },
              { width: 40 },
            ]}
          />
        ) : (
          <DataTable
            data={allocations}
            columns={columns}
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
              ) : filterNames.length > 0 || classValue.classId || search.trim() ? (
                <NothingMatched
                  what="allocations"
                  filters={filterNames}
                  search={search}
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
        title="Leave and outings"
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
