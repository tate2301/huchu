"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@corelithzw/react";

import { PersonAvatar } from "@corelithzw/ui/components/person-avatar";
import { RecordActions, type RecordVerb } from "../common/record-actions";
import {
  LoadError,
  NothingMatched,
  NothingYet,
  SaveError,
  TableRowsSkeleton,
} from "../common/states";
import { DataTable } from "@corelithzw/ui/components/data-table";
import { NumericCell } from "@corelithzw/ui/components/numeric-cell";
import { fetchJson } from "@corelithzw/platform/api-client";

import {
  dateWindow,
  fetchLeaveRequests,
  leaveTone,
  type LeaveRequest,
  type LeaveStatus,
} from "./boarding-data";
import { LeaveRequestDialog } from "./boarding-dialogs";

/**
 * Leave and outing requests, as a table with its verbs in the rows.
 *
 * The canvas draws this twice — once as its own screen and once as the second
 * card on the allocations board — so it is one component with a `filters` prop
 * rather than two tables that drift apart. The columns are the canvas's:
 * Student, Type, Window, Status, and nothing else, because a warden scanning
 * for who is still out does not read a destination column at a glance.
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
  /** Rows the caller has already read, when it shares one query with a board. */
  requests: given,
}: {
  filters?: LeaveFilters;
  onClearFilters?: () => void;
  filterNames?: string[];
  requests?: LeaveRequest[];
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
    enabled: given === undefined,
  });

  // Year group and a name search are not queries the leave endpoint takes — a
  // request knows a child, not a class — so both are applied here.
  const rows = useMemo(() => {
    const source = given ?? leaveQuery.data ?? [];
    const needle = (filters.search ?? "").trim().toLowerCase();
    return source.filter((row) => {
      if (filters.classId && row.student.currentClass?.id !== filters.classId) return false;
      if (!needle) return true;
      return `${row.student.lastName} ${row.student.firstName} ${row.student.studentNo}`
        .toLowerCase()
        .includes(needle);
    });
  }, [given, leaveQuery.data, filters.classId, filters.search]);

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
                {row.original.allocation ? ` · ${row.original.allocation.hostel.name}` : ""}
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
            {row.original.requestType === "LEAVE" ? "LEAVE" : "OUTING"}
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
          <Badge tone={leaveTone(row.original.status)}>{row.original.status}</Badge>
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

          return <RecordActions resource="schools.boarding" verbs={verbs} />;
        },
      },
    ],
    [pendingId, step],
  );

  const loading = given === undefined && leaveQuery.isLoading;
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
          columns={[
            { avatar: true, twoLine: true },
            { width: 90 },
            { width: 140 },
            { width: 110 },
            { width: 240 },
          ]}
        />
      ) : (
        <DataTable
          data={rows}
          columns={columns}
          searchPlaceholder="Search leave requests"
          searchSubmitLabel="Search"
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
