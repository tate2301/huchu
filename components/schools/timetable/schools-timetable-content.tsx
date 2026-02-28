"use client";

import { useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useQuery } from "@tanstack/react-query";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { DataTable } from "@/components/ui/data-table";
import { NumericCell } from "@/components/ui/numeric-cell";
import { getApiErrorMessage } from "@/lib/api-client";
import { fetchTeacherAssignments } from "@/lib/schools/admin-v2";

type TimetableRow = Awaited<ReturnType<typeof fetchTeacherAssignments>>["data"][number] & {
  slot: string;
};

function deriveSlot(index: number) {
  const slots = [
    "P1 08:00",
    "P2 09:00",
    "P3 10:30",
    "P4 11:30",
    "P5 13:30",
    "P6 14:30",
  ];
  return slots[index % slots.length];
}

export function SchoolsTimetableContent() {
  const query = useQuery({
    queryKey: ["schools", "timetable", "assignments"],
    queryFn: () => fetchTeacherAssignments({ page: 1, limit: 400, isActive: true }),
  });

  const rows = useMemo<TimetableRow[]>(
    () =>
      (query.data?.data ?? []).map((assignment, index) => ({
        ...assignment,
        slot: deriveSlot(index),
      })),
    [query.data],
  );

  const columns = useMemo<ColumnDef<TimetableRow>[]>(
    () => [
      {
        id: "slot",
        header: "Slot",
        cell: ({ row }) => <NumericCell>{row.original.slot}</NumericCell>,
      },
      {
        id: "term",
        header: "Term",
        cell: ({ row }) => row.original.term.name,
      },
      {
        id: "class",
        header: "Class",
        cell: ({ row }) => (
          <span>
            {row.original.class.name}
            {row.original.stream ? ` / ${row.original.stream.name}` : ""}
          </span>
        ),
      },
      {
        id: "subject",
        header: "Subject",
        cell: ({ row }) => (
          <div>
            <div className="font-medium">{row.original.subject.name}</div>
            <div className="text-xs text-muted-foreground">{row.original.subject.code}</div>
          </div>
        ),
      },
      {
        id: "teacher",
        header: "Teacher",
        cell: ({ row }) => row.original.teacherProfile.user.name,
      },
    ],
    [],
  );

  return (
    <div className="space-y-4">
      {query.error ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to load timetable assignments</AlertTitle>
          <AlertDescription>{getApiErrorMessage(query.error)}</AlertDescription>
        </Alert>
      ) : null}

      <section className="section-shell grid gap-2 md:grid-cols-4">
        <div>
          <h2 className="text-sm font-semibold">Assignments</h2>
          <p className="font-mono tabular-nums">{rows.length}</p>
        </div>
        <div>
          <h2 className="text-sm font-semibold">Teachers</h2>
          <p className="font-mono tabular-nums">
            {new Set(rows.map((row) => row.teacherProfile.id)).size}
          </p>
        </div>
        <div>
          <h2 className="text-sm font-semibold">Classes</h2>
          <p className="font-mono tabular-nums">
            {new Set(rows.map((row) => `${row.class.id}:${row.stream?.id ?? "all"}`)).size}
          </p>
        </div>
        <div>
          <h2 className="text-sm font-semibold">Terms</h2>
          <p className="font-mono tabular-nums">
            {new Set(rows.map((row) => row.term.id)).size}
          </p>
        </div>
      </section>

      <h2 className="text-section-title">Teaching Timetable Allocation</h2>
      <DataTable
        data={rows}
        columns={columns}
        searchPlaceholder="Search timetable assignments"
        searchSubmitLabel="Search"
        pagination={{ enabled: true }}
        emptyState={
          query.isLoading
            ? "Loading timetable..."
            : "No class-subject assignments found. Configure assignments under Teachers."
        }
      />
    </div>
  );
}

