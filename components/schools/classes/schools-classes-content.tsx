"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { RecordList, type RecordListRow } from "@/components/records/record-list";
import { RecordMark } from "@/components/records/record-mark";
import { activeFilterCount, FilterSelect } from "@/components/schools/common/filter-select";
import { CreateButton, RecordActions } from "@/components/schools/common/record-actions";
import { TableControls, TableSearch } from "@/components/records/table-controls";
import {
  ListRowsSkeleton,
  LoadError,
  NothingMatched,
  NothingYet,
  SaveError,
} from "@/components/records/states";
import { VerticalDataViews } from "@/components/ui/vertical-data-views";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { recordType } from "@/lib/records/registry";
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
 *
 * ## Why they are lists and not tables
 *
 * Both are opened to find a class and go into it — the class record is where
 * its subjects, its form teacher and its roll live — rather than to compare
 * one class's capacity against another's. Two seven-column tables were
 * spending two header rows and fourteen columns on twelve rows of ladder, and
 * the level number, which the school never says out loud, had a column of its
 * own.
 *
 * A stream's row goes to its class, because a stream has no page of its own
 * and its class is the page that explains it.
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
  const [search, setSearch] = useState("");

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

  const visibleClasses = useMemo(() => {
    const typed = search.trim().toLowerCase();
    return classes.filter((row) => {
      if (levelFilter && String(row.level ?? "") !== levelFilter) return false;
      if (streamedFilter === "streamed" && row._count.streams === 0) return false;
      if (streamedFilter === "unstreamed" && row._count.streams > 0) return false;
      if (typed && !`${row.name} ${row.code}`.toLowerCase().includes(typed)) return false;
      return true;
    });
  }, [classes, levelFilter, streamedFilter, search]);

  const visibleStreams = useMemo(() => {
    const typed = search.trim().toLowerCase();
    return streams.filter((row) => {
      if (classFilter && row.classId !== classFilter) return false;
      if (levelFilter && String(row.classLevel ?? "") !== levelFilter) return false;
      if (typed && !`${row.name} ${row.code} ${row.className}`.toLowerCase().includes(typed)) {
        return false;
      }
      return true;
    });
  }, [streams, classFilter, levelFilter, search]);

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

  const classRows = useMemo<RecordListRow[]>(
    () =>
      visibleClasses.map((schoolClass) => ({
        id: schoolClass.id,
        href: recordType("CLASS").href(schoolClass.id),
        leading: <RecordMark kind="class" name={schoolClass.name} size="sm" />,
        title: schoolClass.name,
        // The code alone. A class has no second fact that tells two of them
        // apart — the level is the ordering number the school never says out
        // loud, and the roll and the capacity are figures, which belong on the
        // right of the row rather than under the name.
        subtitle: <span className="font-mono">{schoolClass.code}</span>,
        facts: [
          { label: "On the roll", value: schoolClass._count.students, kind: "number" },
          { label: "Streams", value: schoolClass._count.streams, kind: "number" },
          { label: "Places", value: schoolClass.capacity ?? "—", mono: true },
        ],
        actions: (
          <RecordActions
            layout="menu"
            label={`Row actions for ${schoolClass.name}`}
            resource="schools.academics"
            verbs={[
              {
                label: "Edit",
                action: "edit",
                onSelect: () => {
                  setEditingClass(schoolClass);
                  setClassDialogOpen(true);
                },
              },
              {
                label: "Add a stream",
                action: "create",
                onSelect: () => {
                  setEditingStream(null);
                  setNewStreamClassId(schoolClass.id);
                  setStreamDialogOpen(true);
                },
              },
              {
                label: "Delete",
                action: "archive",
                tone: "danger",
                loading: deleteClass.isPending,
                confirm: {
                  title: `Delete ${schoolClass.name}?`,
                  description:
                    "The class disappears from every picker in the module. It is refused while any pupil, stream, mark sheet or fee structure still points at it.",
                  confirmLabel: "Delete the class",
                },
                onSelect: () => deleteClass.mutate(schoolClass.id),
              },
            ]}
          />
        ),
      })),
    [visibleClasses, deleteClass],
  );

  const streamRows = useMemo<RecordListRow[]>(
    () =>
      visibleStreams.map((stream) => ({
        id: stream.id,
        // A stream has no page of its own, so its row opens the class that
        // explains it — which is also where its pupils and its subjects are.
        href: recordType("CLASS").href(stream.classId),
        leading: <RecordMark kind="class" name={stream.name} size="sm" />,
        title: stream.name,
        subtitle: (
          <>
            <span className="font-mono">{stream.code}</span>
            {" · "}
            {stream.className}
          </>
        ),
        facts: [{ label: "Places", value: stream.capacity ?? "—", mono: true }],
        actions: (
          <RecordActions
            layout="menu"
            label={`Row actions for ${stream.name}`}
            resource="schools.academics"
            verbs={[
              {
                label: "Edit",
                action: "edit",
                onSelect: () => {
                  setEditingStream(stream);
                  setStreamDialogOpen(true);
                },
              },
              {
                label: "Delete",
                action: "archive",
                tone: "danger",
                loading: deleteStream.isPending,
                confirm: {
                  title: `Delete ${stream.name}?`,
                  description:
                    "The stream disappears from every register and mark sheet filter. It is refused while any pupil is still in it.",
                  confirmLabel: "Delete the stream",
                },
                onSelect: () => deleteStream.mutate(stream.id),
              },
            ]}
          />
        ),
      })),
    [visibleStreams, deleteStream],
  );


  const narrowed = [
    levels.find((level) => level.value === levelFilter)?.label,
    classes.find((row) => row.id === classFilter)?.name,
  ].filter((value): value is string => Boolean(value));

  const clearFilters = () => {
    setLevelFilter("");
    setStreamedFilter("");
    setClassFilter("");
    setSearch("");
  };

  const classOptions = classes.map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
  }));

  return (
    <div className="space-y-4">
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
          /* No count until there is one to give. A rail that opens on
             "Classes 0 / Streams 0" and lands on "Classes 12" reads as data
             arriving late and wrong; nothing at all reads as loading. */
          {
            id: "classes",
            label: "Classes",
            count: classesQuery.isPending ? undefined : classes.length,
          },
          {
            id: "streams",
            label: "Streams",
            count: classesQuery.isPending ? undefined : streams.length,
          },
        ]}
        value={activeView}
        onValueChange={(value) => setActiveView(value as ClassesView)}
        railLabel="Class views"
      >
        <div className={activeView === "classes" ? "space-y-2" : "hidden"}>
          <TableControls
            sticky
            search={
              <TableSearch
                value={search}
                onChange={setSearch}
                placeholder="Search name or code"
              />
            }
            filterCount={activeFilterCount(levelFilter, streamedFilter)}
            filters={
              <>
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
              </>
            }
            count={
              classesQuery.isLoading
                ? null
                : `${visibleClasses.length} of ${classes.length}`
            }
            actions={
              <CreateButton
                resource="schools.academics"
                label="New class"
                onSelect={() => {
                  setEditingClass(null);
                  setClassDialogOpen(true);
                }}
              />
            }
          />

          {classesQuery.isLoading ? (
            <ListRowsSkeleton rows={8} label="Reading the class ladder" />
          ) : classes.length === 0 ? (
            <NothingYet
              title="No classes yet"
              body="A class is the year group everything else hangs off — pupils, registers, mark sheets and fee structures."
              action={
                <CreateButton
                  resource="schools.academics"
                  label="Add the first class"
                  onSelect={() => {
                    setEditingClass(null);
                    setClassDialogOpen(true);
                  }}
                />
              }
            />
          ) : visibleClasses.length === 0 ? (
            <NothingMatched
              what="classes"
              filters={narrowed}
              search={search}
              onClear={clearFilters}
            />
          ) : (
            <RecordList rows={classRows} />
          )}
        </div>

        <div className={activeView === "streams" ? "space-y-2" : "hidden"}>
          {/* Not a second list to keep in step with the first — it is "the
              other view" literally: the same ladder read one rung down. */}
          <p className="text-sm text-[color:var(--text-muted)]">
            Every stream here belongs to a class on the Classes tab — the same
            ladder, split. This is the other view of it.
          </p>
          <TableControls
            sticky
            search={
              <TableSearch
                value={search}
                onChange={setSearch}
                placeholder="Search name, code or class"
              />
            }
            filterCount={activeFilterCount(classFilter, levelFilter)}
            filters={
              <>
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
              </>
            }
            count={
              classesQuery.isLoading
                ? null
                : `${visibleStreams.length} of ${streams.length}`
            }
            actions={
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
            }
          />

          {classesQuery.isLoading ? (
            <ListRowsSkeleton rows={8} label="Reading the streams" />
          ) : streams.length === 0 ? (
            <NothingYet
              title="No streams yet"
              body="A stream is the set a class is split into — Form 2 Alpha, Form 2 Beta, Form 2 Gamma, Form 2 Delta. Registers, mark sheets and result publishing all narrow by one."
            />
          ) : visibleStreams.length === 0 ? (
            <NothingMatched
              what="streams"
              filters={narrowed}
              search={search}
              onClear={clearFilters}
            />
          ) : (
            <RecordList rows={streamRows} />
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
