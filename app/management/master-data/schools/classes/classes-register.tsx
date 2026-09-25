"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  ActivityTrail,
  ListColumn,
  ListRow,
  RecordHeader,
  RecordList,
  RegisterLayout,
  SectionAction,
  SectionHeading,
  type ListColumnState,
  type RecordListRow,
} from "@/components/management/ui";
import {
  ClassFormDialog,
  type ClassFormValues,
} from "@/components/schools/classes/class-form-dialog";
import {
  ClassSubjectFormDialog,
  type ClassSubjectFormValues,
} from "@/components/schools/classes/class-subject-form-dialog";
import {
  StreamFormDialog,
  type StreamFormValues,
} from "@/components/schools/classes/stream-form-dialog";
import { ManagementShell } from "@/components/settings/management-shell";
import { useSchoolAccess } from "@/components/schools/common/use-school-access";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { dsConfirm } from "@/components/ui/ds-confirm";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import {
  Grid3x3,
  ListBullets,
  MedusaBookOpenIcon,
  Plus,
  SlidersHorizontal,
} from "@/lib/icons";
import { recordType } from "@/lib/records/registry";
import { fetchSchoolsClasses } from "@/lib/schools/admin-v2";

import {
  BackToList,
  DetailField,
  DetailGrid,
  InlineText,
  RecordEmpty,
} from "./record-fields";

/**
 * Classes and streams, as the register `Classes.dc.html` draws it.
 *
 * The ladder is a list beside the record, not a table and not a pair of tabs.
 * A class is opened to look at *one* class — its code, its year group, the
 * streams it is split into — and the two views the old screen had ("Classes"
 * and "Streams") were the same ladder read at two rungs, which is what the
 * Streams section inside a class record says with nothing switched.
 *
 * `/classes/[id]` is the same component with a row selected: the list stays
 * beside the record rather than being replaced by it.
 *
 * Presentation only. Every query key, endpoint and gate below is the one the
 * two components this replaces already used.
 */

type ClassStream = {
  id: string;
  code: string;
  name: string;
  capacity: number | null;
};

type ClassSubjectRow = {
  id: string;
  subject: { id: string; code: string; name: string } | null;
  stream: { id: string; code: string; name: string } | null;
  /**
   * The scalar, not a `term` relation: `classDetailInclude` in
   * `/api/v2/schools/classes/[id]` includes subject, stream and teacher and
   * **not** term, so `entry.term` is always undefined on this endpoint. The
   * foreign key comes back with the row's other scalars, and it is what the
   * dialog's `termId:subjectId` duplicate key is built from.
   */
  termId: string;
  teacherProfile: {
    id: string;
    employeeCode: string;
    user: { id: string; name: string | null; email: string } | null;
  } | null;
};

type ClassRecord = {
  id: string;
  code: string;
  name: string;
  level: number | null;
  capacity: number | null;
  streams: ClassStream[];
  classSubjects: ClassSubjectRow[];
  _count?: { students?: number; streams?: number };
};

export function ClassesRegister({ selectedId }: { selectedId?: string }) {
  const config = recordType("CLASS");
  const router = useRouter();
  const queryClient = useQueryClient();
  const access = useSchoolAccess();

  const canCreate = access.can("schools.academics", "create");
  const canEdit = access.can("schools.academics", "edit");
  const canArchive = access.can("schools.academics", "archive");

  // Timetabling is the registrar's grant, not the ladder's: the endpoint
  // behind "Add a subject" gates on `schools.teachers` create, so that is what
  // decides whether the verb is drawn — the same predicate the subject record
  // uses for the same row read from the other side.
  const canTimetable = access.can("schools.teachers", "create");

  const [search, setSearch] = React.useState("");
  const [classDialogOpen, setClassDialogOpen] = React.useState(false);
  const [streamDialogOpen, setStreamDialogOpen] = React.useState(false);
  const [subjectDialogOpen, setSubjectDialogOpen] = React.useState(false);

  const classesQuery = useQuery({
    queryKey: ["schools", "classes"],
    queryFn: () => fetchSchoolsClasses({ page: 1, limit: 200 }),
  });

  const recordQuery = useQuery({
    queryKey: config.queryKey(selectedId ?? ""),
    queryFn: () => fetchJson<ClassRecord>(config.apiPath(selectedId ?? "")),
    enabled: Boolean(selectedId),
  });

  const classes = React.useMemo(
    () => classesQuery.data?.data ?? [],
    [classesQuery.data],
  );

  const visible = React.useMemo(() => {
    const typed = search.trim().toLowerCase();
    if (!typed) return classes;
    return classes.filter((row) =>
      `${row.name} ${row.code}`.toLowerCase().includes(typed),
    );
  }, [classes, search]);

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["schools", "classes"] });
    void queryClient.invalidateQueries({ queryKey: ["schools", "academics"] });
    if (selectedId) {
      void queryClient.invalidateQueries({ queryKey: config.queryKey(selectedId) });
    }
  }

  const patchClass = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      fetchJson(config.apiPath(selectedId ?? ""), {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    onSuccess: invalidate,
  });

  const createClass = useMutation({
    mutationFn: (values: ClassFormValues) =>
      fetchJson("/api/v2/schools/classes", {
        method: "POST",
        body: JSON.stringify({
          code: values.code.trim(),
          name: values.name.trim(),
          level: values.level ? Number(values.level) : null,
          capacity: values.capacity ? Number(values.capacity) : null,
        }),
      }),
    onSuccess: () => {
      setClassDialogOpen(false);
      invalidate();
    },
  });

  const deleteClass = useMutation({
    mutationFn: (id: string) =>
      fetchJson(`/api/v2/schools/classes/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      invalidate();
      router.push(config.indexHref);
    },
  });

  const createStream = useMutation({
    mutationFn: (values: StreamFormValues) =>
      fetchJson("/api/v2/schools/streams", {
        method: "POST",
        body: JSON.stringify({
          classId: values.classId,
          code: values.code.trim(),
          name: values.name.trim(),
          capacity: values.capacity ? Number(values.capacity) : null,
        }),
      }),
    onSuccess: () => {
      setStreamDialogOpen(false);
      invalidate();
    },
  });

  /**
   * Timetabling a subject onto this class.
   *
   * The same `POST /api/v2/schools/teachers/assignments` `ClassSubjectsPanel`
   * wrote, with the same three invalidations after it — a class subject is one
   * row whichever side it is created from. Nothing new is fetched or written
   * here; the verb is only reached from the record that makes the question
   * worth asking.
   */
  const createClassSubject = useMutation({
    mutationFn: (values: ClassSubjectFormValues) =>
      fetchJson("/api/v2/schools/teachers/assignments", {
        method: "POST",
        body: JSON.stringify({
          termId: values.termId,
          classId: selectedId,
          streamId: values.streamId || null,
          subjectId: values.subjectId,
          teacherProfileId: values.teacherProfileId,
        }),
      }),
    onSuccess: () => {
      setSubjectDialogOpen(false);
      void queryClient.invalidateQueries({
        queryKey: ["schools", "class-subjects", selectedId],
      });
      void queryClient.invalidateQueries({ queryKey: ["schools", "timetable"] });
      invalidate();
    },
  });

  const record = recordQuery.data ?? null;

  const state: ListColumnState = classesQuery.isLoading
    ? "loading"
    : classesQuery.isError
      ? "failed"
      : visible.length > 0
        ? "ready"
        : search.trim()
          ? "no-matches"
          : "empty";

  const streamRows = (record?.streams ?? []).map(
    (stream): RecordListRow => ({
      id: stream.id,
      code: stream.code,
      name: stream.name,
      // Not the roll: the class endpoint counts pupils for the class and not
      // for each stream, and a column of invented figures is worse than a
      // column of the figure the record actually holds.
      value:
        stream.capacity == null
          ? undefined
          : { kind: "number", value: stream.capacity },
    }),
  );

  // What is taught here, and by whom — the panel the tabbed record page carried
  // under a "Subjects" tab. The value column is the teacher because that is
  // what the class endpoint returns for an assignment; it does not count the
  // pupils on each one.
  const subjectRows = (record?.classSubjects ?? []).map(
    (entry): RecordListRow => ({
      id: entry.id,
      code: entry.subject?.code,
      name: [entry.subject?.name ?? "—", entry.stream?.name ?? "all streams"].join(" · "),
      value: {
        kind: "text",
        value:
          entry.teacherProfile?.user?.name ??
          entry.teacherProfile?.employeeCode ??
          "Nobody yet",
      },
    }),
  );

  return (
    /* The surface's content column. `SettingsFrame` looks for a
       `RegisterLayout` among its children and hands it the row whole — the
       dialogs beside it portal out and occupy none of it. */
    <ManagementShell
      railCounts={
        classesQuery.isLoading ? undefined : { "schools-classes": classes.length }
      }
    >
      <RegisterLayout
        hasSelection={Boolean(selectedId)}
        list={
          <ListColumn
            title="Classes and streams"
            noun="class"
            count={classesQuery.isLoading ? undefined : classes.length}
            state={state}
            columns={{ row: "Class", value: "Pupils" }}
            search={{
              value: search,
              onChange: setSearch,
              placeholder: "Search name or code",
            }}
            onNew={canCreate ? () => setClassDialogOpen(true) : undefined}
            onRetry={() => void classesQuery.refetch()}
            emptyLabel="No classes"
          >
            {visible.map((row) => (
              <ListRow
                key={row.id}
                code={row.code}
                name={row.name}
                value={row._count.students}
                href={config.href(row.id)}
                selected={row.id === selectedId}
              />
            ))}
          </ListColumn>
        }
      >
        {record ? (
          <>
            <BackToList href={config.indexHref} label="Classes and streams" />

            <RecordHeader
              title={record.name}
              icon={Grid3x3}
              onRename={
                canEdit
                  ? (next) => patchClass.mutate({ name: next })
                  : undefined
              }
              renameLabel="Rename the class"
              // No labelled verb: the board draws "Archive", and a class has
              // no archived state — `/api/v2/schools/classes/[id]` takes code,
              // name, level and capacity and nothing else. Deleting is
              // destructive, so rule 3 puts it in the overflow rather than
              // dressing it up as an archive.
              overflow={
                <>
                  {/* The three doors the old tabbed record page carried.
                      Links, not handlers — the overflow is where a rare verb
                      lives, and a destination in it is still a destination. */}
                  <DropdownMenuItem asChild>
                    <Link href={`/schools/students/class/${record.id}`}>The roll</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href={`/schools/finance/class/${record.id}`}>Fees</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href={`/schools/results/class/${record.id}`}>Marks</Link>
                  </DropdownMenuItem>
                  {canArchive ? (
                    <DropdownMenuItem
                      onSelect={() => {
                        void (async () => {
                          const confirmed = await dsConfirm({
                            title: `Delete ${record.name}?`,
                            description:
                              "The class disappears from every picker in the module. It is refused while any pupil, stream, mark sheet or fee structure still points at it.",
                            confirmLabel: "Delete the class",
                            variant: "danger",
                          });
                          if (confirmed) deleteClass.mutate(record.id);
                        })();
                      }}
                    >
                      Delete the class
                    </DropdownMenuItem>
                  ) : null}
                </>
              }
            />

            <SectionHeading icon={SlidersHorizontal} tone="brand">
              Details
            </SectionHeading>
            <DetailGrid>
              <DetailField label="Code">
                {(id) => (
                  <InlineText
                    id={id}
                    mono
                    disabled={!canEdit}
                    value={record.code}
                    onCommit={(next) => patchClass.mutate({ code: next.trim() })}
                  />
                )}
              </DetailField>
              {/* The board draws a picker here. The model holds an integer —
                  the ordering number the school never says out loud — and
                  there is no year-group table to pick from, so it stays the
                  number it is rather than a list of guesses. */}
              <DetailField label="Year group">
                {(id) => (
                  <InlineText
                    id={id}
                    mono
                    inputMode="numeric"
                    disabled={!canEdit}
                    value={record.level == null ? "" : String(record.level)}
                    onCommit={(next) =>
                      patchClass.mutate({ level: next.trim() ? Number(next) : null })
                    }
                  />
                )}
              </DetailField>
              <DetailField label="Capacity">
                {(id) => (
                  <InlineText
                    id={id}
                    mono
                    inputMode="numeric"
                    disabled={!canEdit}
                    value={record.capacity == null ? "" : String(record.capacity)}
                    onCommit={(next) =>
                      patchClass.mutate({ capacity: next.trim() ? Number(next) : null })
                    }
                  />
                )}
              </DetailField>
            </DetailGrid>

            <SectionHeading
              icon={ListBullets}
              count={record.streams.length}
              action={
                canCreate ? (
                  <SectionAction
                    icon={Plus}
                    onClick={() => setStreamDialogOpen(true)}
                  >
                    Add a stream
                  </SectionAction>
                ) : undefined
              }
            >
              Streams
            </SectionHeading>
            {streamRows.length > 0 ? (
              <RecordList
                columns={{ row: "Stream", value: "Places" }}
                valueWidth={48}
                rows={streamRows}
              />
            ) : (
              <RecordEmpty>This class is not split into streams</RecordEmpty>
            )}

            {/* Not on `Classes.dc.html`, which draws Details, Streams and
                Activity. It is here because the tabbed record page this
                register replaced timetabled subjects onto a class, and the
                subject record draws the mirror of this section for the same
                row read from the other end. Dropping it would have made
                "History has nobody teaching it" a thing nobody could fix from
                the class. Rule 2 puts the verb on the heading. */}
            <SectionHeading
              icon={MedusaBookOpenIcon}
              count={subjectRows.length}
              action={
                canTimetable ? (
                  <SectionAction
                    icon={Plus}
                    onClick={() => setSubjectDialogOpen(true)}
                  >
                    Add a subject
                  </SectionAction>
                ) : undefined
              }
            >
              Subjects
            </SectionHeading>
            {subjectRows.length > 0 ? (
              <RecordList
                columns={{ row: "Subject", value: "Teacher" }}
                valueWidth={120}
                rows={subjectRows}
              />
            ) : (
              <RecordEmpty>Nothing is timetabled for this class yet</RecordEmpty>
            )}

            <ActivityTrail events={[]} />
          </>
        ) : (
          /* Rule 13's narrow case for a register whose selection is the route:
             above 900px the record column is on screen with nothing in it
             until a row is picked, and a blank half-screen reads as a screen
             that failed to load.

             Below 900px only one column is on screen and `hasSelection` makes
             it this one — so a record that is still opening, or that failed,
             has to carry the way back to the list with it or the list is
             unreachable without the browser's own Back. */
          <>
            {selectedId ? (
              <BackToList href={config.indexHref} label="Classes and streams" />
            ) : null}
            <RecordEmpty>
              {selectedId
                ? recordQuery.isError
                  ? "That class could not be loaded."
                  : "Opening the class"
                : "Pick a class to see it."}
            </RecordEmpty>
          </>
        )}
      </RegisterLayout>

      {record ? (
        <ClassSubjectFormDialog
          open={subjectDialogOpen}
          onOpenChange={(open) => {
            setSubjectDialogOpen(open);
            if (!open) createClassSubject.reset();
          }}
          classId={record.id}
          className={record.name}
          editing={null}
          takenSubjectIds={record.classSubjects.map(
            (entry) => `${entry.termId}:${entry.subject?.id ?? ""}`,
          )}
          isSubmitting={createClassSubject.isPending}
          error={
            createClassSubject.error
              ? getApiErrorMessage(createClassSubject.error)
              : null
          }
          onSubmit={(values) => createClassSubject.mutate(values)}
        />
      ) : null}

      <ClassFormDialog
        open={classDialogOpen}
        onOpenChange={(open) => {
          setClassDialogOpen(open);
          if (!open) createClass.reset();
        }}
        takenCodes={classes.map((row) => row.code)}
        isSubmitting={createClass.isPending}
        error={createClass.error ? getApiErrorMessage(createClass.error) : null}
        onSubmit={(values) => createClass.mutate(values)}
      />

      <StreamFormDialog
        open={streamDialogOpen}
        onOpenChange={(open) => {
          setStreamDialogOpen(open);
          if (!open) createStream.reset();
        }}
        classes={classes.map((row) => ({
          id: row.id,
          code: row.code,
          name: row.name,
        }))}
        defaultClassId={selectedId}
        isSubmitting={createStream.isPending}
        error={createStream.error ? getApiErrorMessage(createStream.error) : null}
        onSubmit={(values) => createStream.mutate(values)}
      />
    </ManagementShell>
  );
}
