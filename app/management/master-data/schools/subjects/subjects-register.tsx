"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { RecordActivityTrail } from "@/components/activity/record-activity-trail";
import {
  HeaderAction,
  ListColumn,
  ListRow,
  RecordHeader,
  RecordList,
  RegisterLayout,
  SectionAction,
  SectionHeading,
  StatusBadge,
  type ListColumnState,
  type RecordListRow,
} from "@/components/management/ui";
import { ManagementShell } from "@/components/settings/management-shell";
import { useSchoolAccess } from "@/components/schools/common/use-school-access";
import {
  SubjectFormDialog,
  type SubjectFormValues,
} from "@/components/schools/subjects/subject-form-dialog";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { dsConfirm } from "@/components/ui/ds-confirm";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import {
  Archive,
  GraduationCap,
  ListBullets,
  MedusaBookOpenIcon,
  Plus,
  SlidersHorizontal,
} from "@/lib/icons";
import { recordType } from "@/lib/records/registry";
import { fetchSchoolsSubjects } from "@/lib/schools/admin-v2";

import {
  BackToList,
  CONTROL_CLASS,
  DetailField,
  DetailGrid,
  InlineText,
  RecordEmpty,
} from "../classes/record-fields";
import {
  AssignClassDialog,
  type AssignClassValues,
} from "./assign-class-dialog";

/**
 * The subject catalogue, as `Subjects.dc.html` draws it.
 *
 * One list, one record, and the record is where a subject is changed — the old
 * screen could only open a dialog over a table, which is why "which classes
 * take this" was a page nobody arrived at.
 *
 * "Core" is a category, not a state, so it is a field and never a chip
 * (rule 5). "Retired" is a state, so the header carries one.
 *
 * Presentation only: the query keys, the endpoints and the campus gate below
 * are the ones `SchoolsSubjectsContent` and `SubjectRecordPage` already used.
 */

type SubjectClassRow = {
  id: string;
  class: { id: string; code: string; name: string } | null;
  stream: { id: string; code: string; name: string } | null;
  term: { id: string; code: string; name: string } | null;
  teacherProfile: {
    id: string;
    employeeCode: string;
    user: { id: string; name: string | null; email: string } | null;
  } | null;
};

type SubjectRecord = {
  id: string;
  code: string;
  name: string;
  isCore: boolean;
  passMark: number | null;
  isActive: boolean;
  classSubjects: SubjectClassRow[];
  _count?: { classSubjects?: number };
};

export function SubjectsRegister({ selectedId }: { selectedId?: string }) {
  const config = recordType("SUBJECT");
  const router = useRouter();
  const queryClient = useQueryClient();
  const access = useSchoolAccess();

  const canCreate = access.can("schools.academics", "create");
  const canEdit = access.can("schools.academics", "edit");
  const canArchive = access.can("schools.academics", "archive");
  // Timetabling is the registrar's grant, not the catalogue's: the endpoint
  // behind "Assign to classes" gates on `schools.teachers` create, so that is
  // what decides whether the verb is drawn.
  const canTimetable = access.can("schools.teachers", "create");

  const [search, setSearch] = React.useState("");
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [assignOpen, setAssignOpen] = React.useState(false);

  const subjectsQuery = useQuery({
    queryKey: ["schools", "subjects"],
    queryFn: () => fetchSchoolsSubjects({ page: 1, limit: 200 }),
  });

  const recordQuery = useQuery({
    queryKey: config.queryKey(selectedId ?? ""),
    queryFn: () => fetchJson<SubjectRecord>(config.apiPath(selectedId ?? "")),
    enabled: Boolean(selectedId),
  });

  const subjects = React.useMemo(
    () => subjectsQuery.data?.data ?? [],
    [subjectsQuery.data],
  );

  const visible = React.useMemo(() => {
    const typed = search.trim().toLowerCase();
    if (!typed) return subjects;
    return subjects.filter((row) =>
      `${row.name} ${row.code}`.toLowerCase().includes(typed),
    );
  }, [subjects, search]);

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["schools", "subjects"] });
    void queryClient.invalidateQueries({ queryKey: ["schools", "academics"] });
    if (selectedId) {
      void queryClient.invalidateQueries({ queryKey: config.queryKey(selectedId) });
    }
  }

  const patchSubject = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      fetchJson(config.apiPath(selectedId ?? ""), {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    onSuccess: invalidate,
  });

  const createSubject = useMutation({
    mutationFn: (values: SubjectFormValues) =>
      fetchJson("/api/v2/schools/subjects", {
        method: "POST",
        body: JSON.stringify({
          code: values.code.trim(),
          name: values.name.trim(),
          isCore: values.isCore,
          passMark: Number(values.passMark),
        }),
      }),
    onSuccess: () => {
      setDialogOpen(false);
      invalidate();
    },
  });

  const deleteSubject = useMutation({
    mutationFn: (id: string) =>
      fetchJson(`/api/v2/schools/subjects/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      invalidate();
      router.push(config.indexHref);
    },
  });

  /**
   * Timetabling this subject onto a class.
   *
   * The same `POST /api/v2/schools/teachers/assignments` the class record's
   * own subjects panel writes — a class subject is one row whichever side it
   * is created from, so nothing new is being fetched or written here, only
   * reached from the record that makes the question worth asking.
   */
  const assignClass = useMutation({
    mutationFn: (values: AssignClassValues) =>
      fetchJson("/api/v2/schools/teachers/assignments", {
        method: "POST",
        body: JSON.stringify({
          termId: values.termId,
          classId: values.classId,
          streamId: values.streamId || null,
          subjectId: selectedId,
          teacherProfileId: values.teacherProfileId,
        }),
      }),
    onSuccess: () => {
      setAssignOpen(false);
      // The keys the class record's own subjects panel invalidates when it
      // writes the same row, so the two sides of one assignment agree.
      void queryClient.invalidateQueries({ queryKey: ["schools", "class-subjects"] });
      void queryClient.invalidateQueries({ queryKey: ["schools", "timetable"] });
      invalidate();
    },
  });

  const record = recordQuery.data ?? null;

  const state: ListColumnState = subjectsQuery.isLoading
    ? "loading"
    : subjectsQuery.isError
      ? "failed"
      : visible.length > 0
        ? "ready"
        : search.trim()
          ? "no-matches"
          : "empty";

  // What a subject's page is opened to answer: which classes take it, and who
  // teaches each. The value column is the teacher rather than a roll, because
  // the endpoint returns the teacher and does not return the roll.
  const classRows = (record?.classSubjects ?? []).map(
    (entry): RecordListRow => ({
      id: entry.id,
      code: entry.class?.code,
      name: [entry.class?.name ?? "—", entry.stream?.name ?? "all streams"].join(" · "),
      value: {
        kind: "text",
        value: entry.teacherProfile?.user?.name ?? entry.teacherProfile?.employeeCode ?? "—",
      },
    }),
  );

  return (
    /* The surface's content column. `SettingsFrame` looks for a
       `RegisterLayout` among its children and hands it the row whole — the
       dialogs beside it portal out and occupy none of it. */
    <ManagementShell
      railCounts={
        subjectsQuery.isLoading ? undefined : { "schools-subjects": subjects.length }
      }
    >
      <RegisterLayout
        hasSelection={Boolean(selectedId)}
        list={
          <ListColumn
            title="Subjects"
            noun="subject"
            count={subjectsQuery.isLoading ? undefined : subjects.length}
            state={state}
            columns={{ row: "Subject", value: "Classes" }}
            search={{
              value: search,
              onChange: setSearch,
              placeholder: "Search name or code",
            }}
            onNew={canCreate ? () => setDialogOpen(true) : undefined}
            onRetry={() => void subjectsQuery.refetch()}
            emptyLabel="No subjects"
          >
            {visible.map((row) => (
              <ListRow
                key={row.id}
                code={row.code}
                name={row.name}
                value={row._count.classSubjects}
                href={config.href(row.id)}
                selected={row.id === selectedId}
                // A retired subject reads muted rather than chipped: a status
                // column in a catalogue where nearly every row says the same
                // word is a column of noise (rule 5). The mute is the ink, not
                // opacity — #16181D at .55 on white is 3.9:1, under the floor,
                // on the one row a reader most needs to read.
                className={row.isActive ? undefined : "[&_*]:text-[#5E6573]"}
              />
            ))}
          </ListColumn>
        }
      >
        {record ? (
          <>
            <BackToList href={config.indexHref} label="Subjects" />

            <RecordHeader
              title={record.name}
              icon={MedusaBookOpenIcon}
              onRename={
                canEdit ? (next) => patchSubject.mutate({ name: next }) : undefined
              }
              renameLabel="Rename the subject"
              // Safe unconditionally: a `header` badge on a healthy state
              // renders nothing (rule 5).
              badge={
                <StatusBadge
                  context="header"
                  tone={record.isActive ? "success" : "neutral"}
                >
                  Retired
                </StatusBadge>
              }
              action={
                canEdit ? (
                  <HeaderAction
                    icon={record.isActive ? Archive : GraduationCap}
                    onClick={() => {
                      void (async () => {
                        if (record.isActive) {
                          const confirmed = await dsConfirm({
                            title: `Retire ${record.name}?`,
                            description:
                              "Every mark already recorded against it stays. It stops appearing on new timetables and mark sheets.",
                            confirmLabel: "Retire the subject",
                            variant: "warning",
                          });
                          if (!confirmed) return;
                        }
                        patchSubject.mutate({ isActive: !record.isActive });
                      })();
                    }}
                  >
                    {record.isActive ? "Retire" : "Teach again"}
                  </HeaderAction>
                ) : undefined
              }
              overflow={
                canArchive ? (
                  <DropdownMenuItem
                    onSelect={() => {
                      void (async () => {
                        const confirmed = await dsConfirm({
                          title: `Delete ${record.name}?`,
                          description:
                            "The subject leaves the catalogue entirely. It is refused while any class still takes it — retire it instead.",
                          confirmLabel: "Delete the subject",
                          variant: "danger",
                        });
                        if (confirmed) deleteSubject.mutate(record.id);
                      })();
                    }}
                  >
                    Delete the subject
                  </DropdownMenuItem>
                ) : undefined
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
                    onCommit={(next) => patchSubject.mutate({ code: next.trim() })}
                  />
                )}
              </DetailField>
              {/* Core or elective is what tells a compulsory subject from a
                  choice, and it is a category rather than a state — a field,
                  never a chip. */}
              <DetailField label="Kind">
                {(id) => (
                  <Select
                    value={record.isCore ? "core" : "optional"}
                    disabled={!canEdit}
                    onValueChange={(value) =>
                      patchSubject.mutate({ isCore: value === "core" })
                    }
                  >
                    <SelectTrigger id={id} className={CONTROL_CLASS}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {/* The board's two words, which are also the two the
                          record page this replaces used and the two the
                          search result prints. The old *list* said
                          "Elective" for the same flag; one of the three had
                          to go and it is the odd one out. */}
                      <SelectItem value="core">Core</SelectItem>
                      <SelectItem value="optional">Optional</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </DetailField>
              {/* The one attribute on this record that changes what a mark
                  *means*: a score is compared against it to decide a pass. */}
              <DetailField label="Pass mark">
                {(id) => (
                  <InlineText
                    id={id}
                    mono
                    inputMode="numeric"
                    disabled={!canEdit}
                    value={record.passMark == null ? "" : String(record.passMark)}
                    onCommit={(next) =>
                      patchSubject.mutate({
                        passMark: next.trim() ? Number(next) : null,
                      })
                    }
                  />
                )}
              </DetailField>
            </DetailGrid>

            {/* Rule 2: the section's verb sits on the section's heading. The
                list below is the thing it adds to, so the button that adds one
                belongs here and not in the record header, where it would be
                competing with the subject's own verb. */}
            <SectionHeading
              icon={ListBullets}
              count={classRows.length}
              action={
                // Rule 9. A retired subject is one nobody should be able to
                // put back onto a timetable by accident — the class side
                // filters it out of its own picker for the same reason, so
                // the verb is absent here rather than present and refused.
                canTimetable && record.isActive ? (
                  <SectionAction icon={Plus} onClick={() => setAssignOpen(true)}>
                    Assign to classes
                  </SectionAction>
                ) : undefined
              }
            >
              Classes taking it
            </SectionHeading>
            {classRows.length > 0 ? (
              <RecordList
                columns={{ row: "Class", value: "Teacher" }}
                valueWidth={120}
                rows={classRows}
              />
            ) : (
              <RecordEmpty>No class takes this subject yet</RecordEmpty>
            )}

            <RecordActivityTrail entityType="SchoolSubject" entityId={record.id} />
          </>
        ) : (
          /* Below 900px this column is the whole screen once a row is picked,
             so a record still opening — or one that failed — carries the way
             back to the catalogue with it. */
          <>
            {selectedId ? (
              <BackToList href={config.indexHref} label="Subjects" />
            ) : null}
            <RecordEmpty>
              {selectedId
                ? recordQuery.isError
                  ? "That subject could not be loaded."
                  : "Opening the subject"
                : "Pick a subject to see it."}
            </RecordEmpty>
          </>
        )}
      </RegisterLayout>

      {record ? (
        <AssignClassDialog
          open={assignOpen}
          onOpenChange={(open) => {
            setAssignOpen(open);
            if (!open) assignClass.reset();
          }}
          subjectName={record.name}
          takenKeys={record.classSubjects.map(
            (entry) =>
              `${entry.term?.id ?? ""}:${entry.class?.id ?? ""}:${entry.stream?.id ?? ""}`,
          )}
          isSubmitting={assignClass.isPending}
          error={assignClass.error ? getApiErrorMessage(assignClass.error) : null}
          onSubmit={(values) => assignClass.mutate(values)}
        />
      ) : null}

      <SubjectFormDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) createSubject.reset();
        }}
        isSubmitting={createSubject.isPending}
        error={createSubject.error ? getApiErrorMessage(createSubject.error) : null}
        onSubmit={(values) => createSubject.mutate(values)}
      />
    </ManagementShell>
  );
}
