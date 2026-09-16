"use client";

import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@corelithzw/react";

import { PersonCell } from "@/components/schools/common/identity-cell";
import { RecordActions, type RecordVerb } from "@/components/schools/common/record-actions";
import {
  LoadError,
  NothingMatched,
  NothingYet,
  SaveError,
  TableRowsSkeleton,
} from "@/components/records/states";
import { DataTable } from "@/components/ui/data-table";
import { NumericCell } from "@/components/ui/numeric-cell";
import { fetchJson } from "@/lib/api-client";

import {
  dateWindow,
  fetchLeaveRequests,
  leaveStatusLabel,
  leaveTone,
  type LeaveRequest,
  type LeaveStatus,
} from "@/components/schools/boarding/boarding-data";
import { LeaveRequestDialog } from "@/components/schools/boarding/boarding-dialogs";

/**
 * Leave and outing requests, as a table with its verbs in the rows.
 *
 * One screen, one table. It used to be drawn twice — here and as a second card
 * on the allocations board — which is why it once took a `requests` prop so the
 * board could hand it rows from a query they shared. The board no longer
 * carries it: a page is about one thing, and the gate book is not what
 * "Allocations" means. So the panel owns its own read again.
 *
 * The columns are the canvas's: Student, Type, Window, Status, and nothing
 * else, because a warden scanning for who is still out does not read a
 * destination column at a glance.
 *
 * The statuses are shown as the workflow's own words — APPROVED, CHECKED_IN,
 * REJECTED, CANCELED — because that is what the gate book says and what the
 * canvas draws. A prettified "Back" reads better in isolation and worse when
 * somebody is comparing the screen against the paper it replaced.
 */

export type LeaveFilters = {
  hostelId?: string;
  status?: LeaveStatus | "";
  requestType?: "LEAVE" | "OUTING" | "";
  classId?: string;
  search?: string;
};

export function LeaveRequestsPanel({
  filters = {},
  onClearFilters,
  filterNames = [],
}: {
  filters?: LeaveFilters;
  onClearFilters?: () => void;
  filterNames?: string[];
}) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<LeaveRequest | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const leaveQuery = useQuery({
    queryKey: [
      "schools",
      "boarding",
      "leave-requests",
      filters.hostelId ?? "",
      filters.status ?? "",
      filters.requestType ?? "",
    ],
    queryFn: () =>
      fetchLeaveRequests({
        ...(filters.hostelId ? { hostelId: filters.hostelId } : {}),
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.requestType ? { requestType: filters.requestType } : {}),
      }),
  });

  // Year group and a name search are not queries the leave endpoint takes — a
  // request knows a child, not a class — so both are applied here.
  const rows = useMemo(() => {
    const source = leaveQuery.data ?? [];
    const needle = (filters.search ?? "").trim().toLowerCase();
    return source.filter((row) => {
      if (filters.classId && row.student.currentClass?.id !== filters.classId) return false;
      if (!needle) return true;
      return `${row.student.lastName} ${row.student.firstName} ${row.student.studentNo}`
        .toLowerCase()
        .includes(needle);
    });
  }, [leaveQuery.data, filters.classId, filters.search]);

  const step = useMutation({
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
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["schools", "boarding"] });
    },
  });

  const columns = useMemo<ColumnDef<LeaveRequest>[]>(
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
            context={row.original.allocation?.hostel.name}
          />
        ),
      },
      {
        id: "type",
        header: "Type",
        // A category, not a state: which kind of absence this is never needs
        // acting on, so it is neutral ink and sentence case rather than a
        // second coloured chip competing with the status beside it.
        cell: ({ row }) => (
          <Badge tone="neutral">
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
        // An affordance, not a field — but the head still needs the cell, or
        // every column below it shifts by one.
        header: () => <span className="sr-only">Row actions</span>,
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
                step.mutate({ id: request.id, step: "approve", body: { approved: true } });
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
                step.mutate({ id: request.id, step: "approve", body: { approved: false } });
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
                step.mutate({ id: request.id, step: "check-out", body: {} });
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
                step.mutate({ id: request.id, step: "check-in", body: {} });
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
            onSelect: () => setEditing(request),
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
              step.mutate({ id: request.id, step: "cancel" });
            },
          });

          return (
            <div className="flex justify-end">
              <RecordActions
                layout="menu"
                resource="schools.boarding"
                label={`Actions for ${request.student.firstName} ${request.student.lastName}`}
                verbs={verbs}
              />
            </div>
          );
        },
      },
    ],
    [pendingId, step],
  );

  const loading = leaveQuery.isLoading;
  const anyFilter = Boolean(
    filters.hostelId || filters.status || filters.requestType || filters.classId || filters.search,
  );

  return (
    <div className="space-y-3">
      {leaveQuery.error ? (
        <LoadError
          what="the leave requests"
          error={leaveQuery.error}
          onRetry={() => void leaveQuery.refetch()}
        />
      ) : null}
      {step.error ? <SaveError what="That leave request" error={step.error} /> : null}

      {loading ? (
        <TableRowsSkeleton
          headers={["Student", "Type", "Window", "Status", ""]}
          columns={[
            { avatar: true, twoLine: true },
            { width: 90, badge: true },
            { width: 150 },
            { width: 110, badge: true },
            { width: 40 },
          ]}
        />
      ) : (
        <DataTable
          data={rows}
          columns={columns}
          /* Its own search box only where the screen above it has none. The
             gate book screen owns one in its control row and narrows `rows`
             with it; a second one inside the table is two boxes over one list,
             and whichever you type into, the other looks broken. */
          {...(filters.search === undefined
            ? { searchPlaceholder: "Search leave requests", searchSubmitLabel: "Search" }
            : {})}
          pagination={{ enabled: true }}
          emptyState={
            anyFilter ? (
              <NothingMatched
                what="requests"
                filters={filterNames}
                onClear={onClearFilters}
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

      <LeaveRequestDialog
        open={editing !== null}
        leaveRequest={editing}
        onClose={() => setEditing(null)}
      />
    </div>
  );
}
