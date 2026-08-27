"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge, MobileList, MobileListEmpty } from "@corelithzw/react";

import { FilterBar, FilterSelect } from "@/components/schools/common/filter-select";
import { PageBand } from "@/components/schools/common/page-band";
import { CreateButton, RecordActions } from "@/components/schools/common/record-actions";
import {
  LoadError,
  NothingMatched,
  NothingYet,
  SaveError,
  TableRowsSkeleton,
} from "@/components/schools/common/states";
import { DataTable } from "@/components/ui/data-table";
import { NumericCell } from "@/components/ui/numeric-cell";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import {
  fetchSchoolsSubjects,
  type SchoolsSubjectRecord,
} from "@/lib/schools/admin-v2";
import { SubjectFormDialog, type SubjectFormValues } from "./subject-form-dialog";

/**
 * The subject catalogue — the canonical one.
 *
 * The module grew three separate subject lists with two different create
 * dialogs between them, and none of the three could edit or retire a row. This
 * is the one that survives; the others now link here.
 */
export function SchoolsSubjectsContent() {
  const queryClient = useQueryClient();
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<SchoolsSubjectRecord | null>(null);

  const subjectsQuery = useQuery({
    queryKey: ["schools", "subjects"],
    queryFn: () => fetchSchoolsSubjects({ page: 1, limit: 200 }),
  });

  const subjects = useMemo(
    () => subjectsQuery.data?.data ?? [],
    [subjectsQuery.data],
  );

  const visible = useMemo(
    () =>
      subjects.filter((row) => {
        if (typeFilter === "core" && !row.isCore) return false;
        if (typeFilter === "elective" && row.isCore) return false;
        if (statusFilter === "active" && !row.isActive) return false;
        if (statusFilter === "retired" && row.isActive) return false;
        return true;
      }),
    [subjects, typeFilter, statusFilter],
  );

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["schools", "subjects"] });
    void queryClient.invalidateQueries({ queryKey: ["schools", "academics"] });
  }

  const save = useMutation({
    mutationFn: (values: SubjectFormValues) => {
      const body = JSON.stringify({
        code: values.code.trim(),
        name: values.name.trim(),
        isCore: values.isCore,
        passMark: Number(values.passMark),
        ...(editing ? { isActive: values.isActive } : {}),
      });
      return editing
        ? fetchJson(`/api/v2/schools/subjects/${editing.id}`, { method: "PATCH", body })
        : fetchJson("/api/v2/schools/subjects", { method: "POST", body });
    },
    onSuccess: () => {
      setDialogOpen(false);
      setEditing(null);
      invalidate();
    },
  });

  const setTaught = useMutation({
    mutationFn: (payload: { id: string; isActive: boolean }) =>
      fetchJson(`/api/v2/schools/subjects/${payload.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: payload.isActive }),
      }),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: (id: string) =>
      fetchJson(`/api/v2/schools/subjects/${id}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });

  const columns = useMemo<ColumnDef<SchoolsSubjectRecord>[]>(
    () => [
      {
        accessorKey: "code",
        header: "Code",
        cell: ({ row }) => (
          <Link
            href={`/management/master-data/schools/subjects/${row.original.id}`}
            className="font-medium text-primary hover:underline"
          >
            {row.original.code}
          </Link>
        ),
      },
      {
        accessorKey: "name",
        header: "Name",
        cell: ({ row }) => (
          <Link
            href={`/management/master-data/schools/subjects/${row.original.id}`}
            className="hover:underline"
          >
            {row.original.name}
          </Link>
        ),
      },
      {
        id: "type",
        header: "Type",
        cell: ({ row }) => (
          <Badge tone={row.original.isCore ? "brand" : "neutral"}>
            {row.original.isCore ? "Core" : "Elective"}
          </Badge>
        ),
      },
      {
        accessorKey: "passMark",
        header: "Pass Mark",
        cell: ({ row }) => <NumericCell>{row.original.passMark}</NumericCell>,
      },
      {
        id: "classes",
        header: "Classes",
        cell: ({ row }) => (
          <NumericCell>{row.original._count.classSubjects}</NumericCell>
        ),
      },
      {
        id: "status",
        header: "Status",
        cell: ({ row }) => (
          <Badge tone={row.original.isActive ? "success" : "neutral"}>
            {row.original.isActive ? "Active" : "Inactive"}
          </Badge>
        ),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <RecordActions
            resource="schools.academics"
            verbs={[
              {
                label: "Edit",
                action: "edit",
                onSelect: () => {
                  setEditing(row.original);
                  setDialogOpen(true);
                },
              },
              row.original.isActive
                ? {
                    label: "Retire",
                    action: "edit" as const,
                    tone: "warning" as const,
                    loading: setTaught.isPending,
                    confirm: {
                      title: `Retire ${row.original.name}?`,
                      description:
                        "Every mark already recorded against it stays. It stops appearing on new timetables and mark sheets.",
                      confirmLabel: "Retire the subject",
                    },
                    onSelect: () =>
                      setTaught.mutate({ id: row.original.id, isActive: false }),
                  }
                : {
                    label: "Teach again",
                    action: "edit" as const,
                    loading: setTaught.isPending,
                    onSelect: () =>
                      setTaught.mutate({ id: row.original.id, isActive: true }),
                  },
              {
                label: "Delete",
                action: "archive",
                tone: "danger",
                loading: remove.isPending,
                confirm: {
                  title: `Delete ${row.original.name}?`,
                  description:
                    "The subject leaves the catalogue entirely. It is refused while any class still takes it — retire it instead.",
                  confirmLabel: "Delete the subject",
                },
                onSelect: () => remove.mutate(row.original.id),
              },
            ]}
          />
        ),
      },
    ],
    [remove, setTaught],
  );

  const narrowed = [
    typeFilter === "core" ? "Core" : typeFilter === "elective" ? "Elective" : "",
    statusFilter === "active"
      ? "Currently taught"
      : statusFilter === "retired"
        ? "Retired"
        : "",
  ].filter(Boolean);

  return (
    <div className="space-y-4">
      <PageBand
        chips={[
          { label: "On the catalogue", value: subjects.length },
          {
            label: "Currently taught",
            value: subjects.filter((row) => row.isActive).length,
            tone: "success",
          },
          {
            label: "Core",
            value: subjects.filter((row) => row.isCore).length,
            tone: "brand",
          },
        ]}
      />

      {subjectsQuery.error ? (
        <LoadError
          what="the subject catalogue"
          error={subjectsQuery.error}
          onRetry={() => void subjectsQuery.refetch()}
        />
      ) : null}

      {/* Retiring and deleting fail for opposite reasons — one is a state
          change, the other is refused while a class still takes the subject —
          so each keeps its own sentence. */}
      {setTaught.error ? (
        <SaveError what="Whether the subject is taught" error={setTaught.error} />
      ) : null}
      {remove.error ? <SaveError what="The subject" error={remove.error} /> : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <FilterBar>
          <FilterSelect
            label="Subject type"
            allLabel="Every subject"
            value={typeFilter}
            options={[
              { value: "core", label: "Core" },
              { value: "elective", label: "Elective" },
            ]}
            onChange={setTypeFilter}
          />
          <FilterSelect
            label="Status"
            allLabel="Taught or retired"
            value={statusFilter}
            options={[
              { value: "active", label: "Currently taught" },
              { value: "retired", label: "Retired" },
            ]}
            onChange={setStatusFilter}
          />
        </FilterBar>
        <CreateButton
          resource="schools.academics"
          label="New subject"
          onSelect={() => {
            setEditing(null);
            setDialogOpen(true);
          }}
        />
      </div>

      {subjectsQuery.isLoading ? (
        <TableRowsSkeleton
          headers={["Code", "Name", "Type", "Pass Mark", "Classes", "Status"]}
          columns={[
            { width: 110 },
            {},
            { width: 100, badge: true },
            { width: 90, align: "right" },
            { width: 90, align: "right" },
            { width: 100, badge: true },
          ]}
          rows={8}
        />
      ) : subjects.length === 0 ? (
        <NothingYet
          title="Nothing on the catalogue yet"
          body="A subject is what the school teaches. Timetable slots, mark sheets and report cards all name one."
        />
      ) : visible.length === 0 ? (
        <NothingMatched
          what="subjects"
          filters={narrowed}
          onClear={() => {
            setTypeFilter("");
            setStatusFilter("");
          }}
        />
      ) : (
        <DataTable
          data={visible}
          columns={columns}
          searchPlaceholder="Search subjects"
          searchSubmitLabel="Search"
          pagination={{ enabled: true }}
          mobileListRenderer={({ rows }) => (
            <MobileList>
              {rows.length === 0 ? (
                <MobileListEmpty>No subjects matched.</MobileListEmpty>
              ) : (
                rows.map(({ row }) => (
                  <MobileList.Row
                    key={row.id}
                    title={row.name}
                    subtitle={[
                      row.code,
                      row.isCore ? "Core" : "Elective",
                      `Pass ${row.passMark}`,
                      row.isActive ? null : "Retired",
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                    onClick={() => {
                      window.location.href = `/management/master-data/schools/subjects/${row.id}`;
                    }}
                  />
                ))
              )}
            </MobileList>
          )}
          emptyState={<NothingMatched what="subjects" />}
        />
      )}

      <SubjectFormDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) {
            setEditing(null);
            save.reset();
          }
        }}
        initial={
          editing
            ? {
                code: editing.code,
                name: editing.name,
                isCore: editing.isCore,
                passMark: String(editing.passMark),
                isActive: editing.isActive,
              }
            : undefined
        }
        isSubmitting={save.isPending}
        error={save.error ? getApiErrorMessage(save.error) : null}
        onSubmit={(values) => save.mutate(values)}
      />
    </div>
  );
}
