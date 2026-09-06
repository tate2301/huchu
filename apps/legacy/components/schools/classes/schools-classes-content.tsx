"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MobileList, MobileListEmpty } from "@corelithzw/react";

import { FilterBar, FilterSelect } from "@/components/schools/common/filter-select";
import { CreateButton, RecordActions } from "@/components/schools/common/record-actions";
import {
  LoadError,
  NothingMatched,
  NothingYet,
  SaveError,
  TableRowsSkeleton,
} from "@/components/schools/common/states";
import { PageBand } from "@/components/schools/common/page-band";
import { DataTable } from "@corelithzw/ui/components/data-table";
import { NumericCell } from "@corelithzw/ui/components/numeric-cell";
import { VerticalDataViews } from "@corelithzw/ui/components/vertical-data-views";
import { fetchJson, getApiErrorMessage } from "@corelithzw/platform/api-client";
import {
  fetchSchoolsClasses,
  type SchoolsClassRecord,
} from "@/lib/schools/admin-v2";
import { ClassFormDialog, type ClassFormValues } from "@/components/schools/classes/class-form-dialog";
import { StreamFormDialog, type StreamFormValues } from "@/components/schools/classes/stream-form-dialog";

/**
 * The year-group ladder and the streams inside it.
 *
 * Two cuts of one structure rather than two destinations, which is why they
 * are a view switcher and not two pages. Both carry the whole verb set now:
 * before this, a class could be created and never edited or removed, and a
 * stream could not be created at all — while every roll, mark sheet and
 * publish window in the module filters by one.
 */

type ClassesView = "classes" | "streams";

type StreamRow = {
  id: string;
  code: string;
  name: string;
  capacity: number | null;
  classId: string;
  className: string;
  classCode: string;
  classLevel: number | null;
};

export function SchoolsClassesContent() {
  const queryClient = useQueryClient();
  const [activeView, setActiveView] = useState<ClassesView>("classes");
  const [levelFilter, setLevelFilter] = useState("");
  const [streamedFilter, setStreamedFilter] = useState("");
  const [classFilter, setClassFilter] = useState("");

  const [classDialogOpen, setClassDialogOpen] = useState(false);
  const [editingClass, setEditingClass] = useState<SchoolsClassRecord | null>(null);
  const [streamDialogOpen, setStreamDialogOpen] = useState(false);
  const [editingStream, setEditingStream] = useState<StreamRow | null>(null);
  // Which class "Add a stream" was pressed on, so the picker opens on it
  // rather than on whatever happens to sort first.
  const [newStreamClassId, setNewStreamClassId] = useState("");

  const classesQuery = useQuery({
    queryKey: ["schools", "classes"],
    queryFn: () => fetchSchoolsClasses({ page: 1, limit: 200 }),
  });

  const classes = useMemo(
    () => classesQuery.data?.data ?? [],
    [classesQuery.data],
  );

  const streams = useMemo<StreamRow[]>(
    () =>
      classes.flatMap((cls) =>
        (cls.streams ?? []).map((stream) => ({
          ...stream,
          classId: cls.id,
          className: cls.name,
          classCode: cls.code,
          classLevel: cls.level,
        })),
      ),
    [classes],
  );

  // The year groups the school actually runs, labelled by the classes at each
  // level — the level number is internal ordering and reads as nonsense on its
  // own ("Year group 8" for Form 1).
  const levels = useMemo(() => {
    const byLevel = new Map<number, Set<string>>();
    for (const row of classes) {
      if (row.level == null) continue;
      const names = byLevel.get(row.level) ?? new Set<string>();
      names.add(row.name);
      byLevel.set(row.level, names);
    }
    return [...byLevel.entries()]
      .sort(([a], [b]) => a - b)
      .map(([value, names]) => ({
        value: String(value),
        label: [...names].sort().join(" / "),
      }));
  }, [classes]);

  const visibleClasses = useMemo(
    () =>
      classes.filter((row) => {
        if (levelFilter && String(row.level ?? "") !== levelFilter) return false;
        if (streamedFilter === "streamed" && row._count.streams === 0) return false;
        if (streamedFilter === "unstreamed" && row._count.streams > 0) return false;
        return true;
      }),
    [classes, levelFilter, streamedFilter],
  );

  const visibleStreams = useMemo(
    () =>
      streams.filter((row) => {
        if (classFilter && row.classId !== classFilter) return false;
        if (levelFilter && String(row.classLevel ?? "") !== levelFilter) return false;
        return true;
      }),
    [streams, classFilter, levelFilter],
  );

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["schools", "classes"] });
    void queryClient.invalidateQueries({ queryKey: ["schools", "academics"] });
  }

  const saveClass = useMutation({
    mutationFn: (values: ClassFormValues) => {
      const body = JSON.stringify({
        code: values.code.trim(),
        name: values.name.trim(),
        level: values.level ? Number(values.level) : null,
        capacity: values.capacity ? Number(values.capacity) : null,
      });
      return editingClass
        ? fetchJson(`/api/v2/schools/classes/${editingClass.id}`, {
            method: "PATCH",
            body,
          })
        : fetchJson("/api/v2/schools/classes", { method: "POST", body });
    },
    onSuccess: () => {
      setClassDialogOpen(false);
      setEditingClass(null);
      invalidate();
    },
  });

  const deleteClass = useMutation({
    mutationFn: (id: string) =>
      fetchJson(`/api/v2/schools/classes/${id}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });

  const saveStream = useMutation({
    mutationFn: (values: StreamFormValues) => {
      const capacity = values.capacity ? Number(values.capacity) : null;
      return editingStream
        ? fetchJson(`/api/v2/schools/streams/${editingStream.id}`, {
            method: "PATCH",
            body: JSON.stringify({
              code: values.code.trim(),
              name: values.name.trim(),
              capacity,
            }),
          })
        : fetchJson("/api/v2/schools/streams", {
            method: "POST",
            body: JSON.stringify({
              classId: values.classId,
              code: values.code.trim(),
              name: values.name.trim(),
              capacity,
            }),
          });
    },
    onSuccess: () => {
      setStreamDialogOpen(false);
      setEditingStream(null);
      invalidate();
    },
  });

  const deleteStream = useMutation({
    mutationFn: (id: string) =>
      fetchJson(`/api/v2/schools/streams/${id}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });

  const classColumns = useMemo<ColumnDef<SchoolsClassRecord>[]>(
    () => [
      {
        accessorKey: "code",
        header: "Code",
        cell: ({ row }) => (
          <Link
            href={`/management/master-data/schools/classes/${row.original.id}`}
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
            href={`/management/master-data/schools/classes/${row.original.id}`}
            className="hover:underline"
          >
            {row.original.name}
          </Link>
        ),
      },
      {
        accessorKey: "level",
        header: "Level",
        cell: ({ row }) => <NumericCell>{row.original.level ?? "-"}</NumericCell>,
      },
      {
        accessorKey: "capacity",
        header: "Capacity",
        cell: ({ row }) => <NumericCell>{row.original.capacity ?? "-"}</NumericCell>,
      },
      {
        id: "streams",
        header: "Streams",
        cell: ({ row }) => <NumericCell>{row.original._count.streams}</NumericCell>,
      },
      {
        id: "students",
        header: "Students",
        cell: ({ row }) => <NumericCell>{row.original._count.students}</NumericCell>,
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
                  setEditingClass(row.original);
                  setClassDialogOpen(true);
                },
              },
              {
                label: "Add a stream",
                action: "create",
                onSelect: () => {
                  setEditingStream(null);
                  setNewStreamClassId(row.original.id);
                  setStreamDialogOpen(true);
                },
              },
              {
                label: "Delete",
                action: "archive",
                tone: "danger",
                loading: deleteClass.isPending,
                confirm: {
                  title: `Delete ${row.original.name}?`,
                  description:
                    "The class disappears from every picker in the module. It is refused while any pupil, stream, mark sheet or fee structure still points at it.",
                  confirmLabel: "Delete the class",
                },
                onSelect: () => deleteClass.mutate(row.original.id),
              },
            ]}
          />
        ),
      },
    ],
    [deleteClass],
  );

  const streamColumns = useMemo<ColumnDef<StreamRow>[]>(
    () => [
      {
        accessorKey: "code",
        header: "Code",
        cell: ({ row }) => <span className="font-medium">{row.original.code}</span>,
      },
      { accessorKey: "name", header: "Name" },
      {
        id: "class",
        header: "Class",
        cell: ({ row }) => (
          <Link
            href={`/management/master-data/schools/classes/${row.original.classId}`}
            className="hover:underline"
          >
            {row.original.className}
          </Link>
        ),
      },
      {
        accessorKey: "capacity",
        header: "Capacity",
        cell: ({ row }) => <NumericCell>{row.original.capacity ?? "-"}</NumericCell>,
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
                  setEditingStream(row.original);
                  setStreamDialogOpen(true);
                },
              },
              {
                label: "Delete",
                action: "archive",
                tone: "danger",
                loading: deleteStream.isPending,
                confirm: {
                  title: `Delete ${row.original.name}?`,
                  description:
                    "The stream disappears from every register and mark sheet filter. It is refused while any pupil is still in it.",
                  confirmLabel: "Delete the stream",
                },
                onSelect: () => deleteStream.mutate(row.original.id),
              },
            ]}
          />
        ),
      },
    ],
    [deleteStream],
  );

  const narrowed = [
    levels.find((level) => level.value === levelFilter)?.label,
    classes.find((row) => row.id === classFilter)?.name,
  ].filter((value): value is string => Boolean(value));

  const classOptions = classes.map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
  }));

  return (
    <div className="space-y-4">
      <PageBand
        chips={[
          { label: "Classes", value: classes.length },
          { label: "Streams", value: streams.length },
          {
            label: "On the roll",
            value: classes.reduce((total, row) => total + row._count.students, 0),
            tone: "brand",
          },
        ]}
      />

      {classesQuery.error ? (
        <LoadError
          what="the class list"
          error={classesQuery.error}
          onRetry={() => void classesQuery.refetch()}
        />
      ) : null}

      {/* A class refused for still holding pupils and a stream refused for the
          same reason are two different rows to go and fix, so they say which. */}
      {deleteClass.error ? (
        <SaveError what="The class" error={deleteClass.error} />
      ) : null}
      {deleteStream.error ? (
        <SaveError what="The stream" error={deleteStream.error} />
      ) : null}

      <VerticalDataViews
        items={[
          { id: "classes", label: "Classes", count: classes.length },
          { id: "streams", label: "Streams", count: streams.length },
        ]}
        value={activeView}
        onValueChange={(value) => setActiveView(value as ClassesView)}
        railLabel="Class views"
      >
        <div className={activeView === "classes" ? "space-y-3" : "hidden"}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <FilterBar>
              <FilterSelect
                label="Year group"
                allLabel="Every year group"
                value={levelFilter}
                options={levels}
                onChange={setLevelFilter}
              />
              <FilterSelect
                label="Streaming"
                allLabel="Streamed or not"
                value={streamedFilter}
                options={[
                  { value: "streamed", label: "Has streams" },
                  { value: "unstreamed", label: "No streams" },
                ]}
                onChange={setStreamedFilter}
              />
            </FilterBar>
            <CreateButton
              resource="schools.academics"
              label="New class"
              onSelect={() => {
                setEditingClass(null);
                setClassDialogOpen(true);
              }}
            />
          </div>

          {classesQuery.isLoading ? (
            <TableRowsSkeleton
              headers={["Code", "Name", "Level", "Capacity", "Streams", "Students"]}
              columns={[
                { width: 110 },
                {},
                { width: 90, align: "right" },
                { width: 100, align: "right" },
                { width: 90, align: "right" },
                { width: 90, align: "right" },
              ]}
              rows={8}
            />
          ) : classes.length === 0 ? (
            <NothingYet
              title="No classes yet"
              body="A class is the year group everything else hangs off — pupils, registers, mark sheets and fee structures."
            />
          ) : visibleClasses.length === 0 ? (
            <NothingMatched
              what="classes"
              filters={narrowed}
              onClear={() => {
                setLevelFilter("");
                setStreamedFilter("");
              }}
            />
          ) : (
            <DataTable
              data={visibleClasses}
              columns={classColumns}
              searchPlaceholder="Search classes"
              searchSubmitLabel="Search"
              pagination={{ enabled: true }}
              mobileListRenderer={({ rows }) => (
                <MobileList>
                  {rows.length === 0 ? (
                    <MobileListEmpty>No classes matched.</MobileListEmpty>
                  ) : (
                    rows.map(({ row }) => (
                      <MobileList.Row
                        key={row.id}
                        title={`${row.code} - ${row.name}`}
                        subtitle={[
                          `${row._count.students} on the roll`,
                          `${row._count.streams} streams`,
                          row.capacity ? `${row.capacity} places` : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                        onClick={() => {
                          window.location.href = `/management/master-data/schools/classes/${row.id}`;
                        }}
                      />
                    ))
                  )}
                </MobileList>
              )}
              emptyState={<NothingMatched what="classes" />}
            />
          )}
        </div>

        <div className={activeView === "streams" ? "space-y-3" : "hidden"}>
          {/* Not a second list to keep in step with the first — the canvas
              calls it "the other view" and means it literally: the same ladder
              read one rung down. */}
          <p className="text-sm text-muted-foreground">
            Every stream here belongs to a class on the Classes tab — the same
            ladder, split. This is the other view of it.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <FilterBar>
              <FilterSelect
                label="Class"
                allLabel="Every class"
                value={classFilter}
                options={classes.map((row) => ({ value: row.id, label: row.name }))}
                onChange={setClassFilter}
              />
              <FilterSelect
                label="Year group"
                allLabel="Every year group"
                value={levelFilter}
                options={levels}
                onChange={setLevelFilter}
              />
            </FilterBar>
            <CreateButton
              resource="schools.academics"
              label="New stream"
              unavailable={
                classes.length === 0
                  ? "A stream belongs to a class. Create the class first."
                  : undefined
              }
              onSelect={() => {
                setEditingStream(null);
                setNewStreamClassId(classFilter);
                setStreamDialogOpen(true);
              }}
            />
          </div>

          {classesQuery.isLoading ? (
            <TableRowsSkeleton
              headers={["Code", "Name", "Class", "Capacity"]}
              columns={[{ width: 110 }, {}, { width: 160 }, { width: 100, align: "right" }]}
              rows={8}
            />
          ) : streams.length === 0 ? (
            <NothingYet
              title="No streams yet"
              body="A stream is the set a class is split into — Form 2 Alpha, Form 2 Beta, Form 2 Gamma, Form 2 Delta. Registers, mark sheets and result publishing all narrow by one."
            />
          ) : visibleStreams.length === 0 ? (
            <NothingMatched
              what="streams"
              filters={narrowed}
              onClear={() => {
                setClassFilter("");
                setLevelFilter("");
              }}
            />
          ) : (
            <DataTable
              data={visibleStreams}
              columns={streamColumns}
              searchPlaceholder="Search streams"
              searchSubmitLabel="Search"
              pagination={{ enabled: true }}
              mobileListRenderer={({ rows }) => (
                <MobileList>
                  {rows.length === 0 ? (
                    <MobileListEmpty>No streams matched.</MobileListEmpty>
                  ) : (
                    rows.map(({ row }) => (
                      <MobileList.Row
                        key={row.id}
                        static
                        title={`${row.code} - ${row.name}`}
                        subtitle={[
                          row.className,
                          row.capacity ? `${row.capacity} places` : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      />
                    ))
                  )}
                </MobileList>
              )}
              emptyState={<NothingMatched what="streams" />}
            />
          )}
        </div>
      </VerticalDataViews>

      <ClassFormDialog
        open={classDialogOpen}
        onOpenChange={(open) => {
          setClassDialogOpen(open);
          if (!open) {
            setEditingClass(null);
            saveClass.reset();
          }
        }}
        initial={
          editingClass
            ? {
                code: editingClass.code,
                name: editingClass.name,
                level: editingClass.level == null ? "" : String(editingClass.level),
                capacity:
                  editingClass.capacity == null ? "" : String(editingClass.capacity),
              }
            : undefined
        }
        takenCodes={classes.map((row) => row.code)}
        isSubmitting={saveClass.isPending}
        error={saveClass.error ? getApiErrorMessage(saveClass.error) : null}
        onSubmit={(values) => saveClass.mutate(values)}
      />

      <StreamFormDialog
        open={streamDialogOpen}
        onOpenChange={(open) => {
          setStreamDialogOpen(open);
          if (!open) {
            setEditingStream(null);
            saveStream.reset();
          }
        }}
        classes={classOptions}
        initial={
          editingStream
            ? {
                classId: editingStream.classId,
                code: editingStream.code,
                name: editingStream.name,
                capacity:
                  editingStream.capacity == null ? "" : String(editingStream.capacity),
              }
            : undefined
        }
        defaultClassId={newStreamClassId}
        isSubmitting={saveStream.isPending}
        error={saveStream.error ? getApiErrorMessage(saveStream.error) : null}
        onSubmit={(values) => saveStream.mutate(values)}
      />
    </div>
  );
}
