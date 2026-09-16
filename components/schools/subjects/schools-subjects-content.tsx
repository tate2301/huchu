"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@corelithzw/react";

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
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { recordType } from "@/lib/records/registry";
import {
  fetchSchoolsSubjects,
  type SchoolsSubjectRecord,
} from "@/lib/schools/admin-v2";
import { SubjectFormDialog, type SubjectFormValues } from "@/components/schools/subjects/subject-form-dialog";
import { AddStandardSubjectsDialog } from "@/components/schools/subjects/add-standard-subjects-dialog";
import type { StandardSubject } from "@/components/schools/subjects/standard-subjects";

/**
 * The subject catalogue — the canonical one.
 *
 * The module grew three separate subject lists with two different create
 * dialogs between them, and none of the three could edit or retire a row. This
 * is the one that survives; the others now link here.
 *
 * ## Why it is a list and not a table
 *
 * Nobody scans a column of pass marks looking for an outlier. The catalogue is
 * opened to find Combined Science and open it, which is what a list is for —
 * and the table it used to be spent a header row and seven columns (Code,
 * Name, Type, Pass mark, Classes, Status, verbs) saying what one row of text
 * says: the mark, the name, the code and the word that tells a core subject
 * from an elective. The two figures a subject carries are still there, on the
 * right of the row, where a fact belongs when it is supporting rather than the
 * thing being compared.
 *
 * "Core" and "Elective" are a category rather than a state, so they are words
 * on the supporting line and not a coloured chip; "Retired" is a state and
 * gets one. A green "Active" badge on every row of a catalogue that is almost
 * entirely active is a column of noise.
 */
export function SchoolsSubjectsContent() {
  const queryClient = useQueryClient();
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [standardOpen, setStandardOpen] = useState(false);
  const [editing, setEditing] = useState<SchoolsSubjectRecord | null>(null);

  const subjectsQuery = useQuery({
    queryKey: ["schools", "subjects"],
    queryFn: () => fetchSchoolsSubjects({ page: 1, limit: 200 }),
  });

  const subjects = useMemo(
    () => subjectsQuery.data?.data ?? [],
    [subjectsQuery.data],
  );

  const visible = useMemo(() => {
    const typed = search.trim().toLowerCase();
    return subjects.filter((row) => {
      if (typeFilter === "core" && !row.isCore) return false;
      if (typeFilter === "elective" && row.isCore) return false;
      if (statusFilter === "active" && !row.isActive) return false;
      if (statusFilter === "retired" && row.isActive) return false;
      if (typed && !`${row.name} ${row.code}`.toLowerCase().includes(typed)) return false;
      return true;
    });
  }, [subjects, typeFilter, statusFilter, search]);

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

  /**
   * The standard catalogue, written one row at a time.
   *
   * Sequential rather than parallel for the same reason the calendar's seeder
   * is: the API refuses a duplicate code, and twenty-two parallel writes turn
   * "three of these were already here" into twenty-two indistinguishable
   * rejections.
   */
  const seed = useMutation({
    mutationFn: async (chosen: StandardSubject[]) => {
      let added = 0;
      for (const subject of chosen) {
        await fetchJson("/api/v2/schools/subjects", {
          method: "POST",
          body: JSON.stringify({
            code: subject.code,
            name: subject.name,
            isCore: subject.isCore,
            passMark: subject.passMark,
          }),
        });
        added += 1;
      }
      return added;
    },
    onSuccess: () => {
      setStandardOpen(false);
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

  const rows = useMemo<RecordListRow[]>(
    () =>
      visible.map((subject) => ({
        id: subject.id,
        href: recordType("SUBJECT").href(subject.id),
        leading: <RecordMark kind="subject" name={subject.name} size="sm" />,
        title: subject.name,
        // The code leads because it is the half that is unique — it is what a
        // timetable slot and a mark sheet line name the subject by — and the
        // word after it is what tells a compulsory subject from a choice.
        subtitle: (
          <>
            <span className="font-mono">{subject.code}</span>
            {" · "}
            {subject.isCore ? "Core" : "Elective"}
          </>
        ),
        status: subject.isActive ? undefined : <Badge tone="neutral">Retired</Badge>,
        facts: [
          { label: "Pass mark", value: subject.passMark, mono: true },
          { label: "Classes", value: subject._count.classSubjects, kind: "number" },
        ],
        actions: (
          <RecordActions
            layout="menu"
            label={`Row actions for ${subject.name}`}
            resource="schools.academics"
            verbs={[
              {
                label: "Edit",
                action: "edit",
                onSelect: () => {
                  setEditing(subject);
                  setDialogOpen(true);
                },
              },
              subject.isActive
                ? {
                    label: "Retire",
                    action: "edit" as const,
                    tone: "warning" as const,
                    loading: setTaught.isPending,
                    confirm: {
                      title: `Retire ${subject.name}?`,
                      description:
                        "Every mark already recorded against it stays. It stops appearing on new timetables and mark sheets.",
                      confirmLabel: "Retire the subject",
                    },
                    onSelect: () => setTaught.mutate({ id: subject.id, isActive: false }),
                  }
                : {
                    label: "Teach again",
                    action: "edit" as const,
                    loading: setTaught.isPending,
                    onSelect: () => setTaught.mutate({ id: subject.id, isActive: true }),
                  },
              {
                label: "Delete",
                action: "archive",
                tone: "danger",
                loading: remove.isPending,
                confirm: {
                  title: `Delete ${subject.name}?`,
                  description:
                    "The subject leaves the catalogue entirely. It is refused while any class still takes it — retire it instead.",
                  confirmLabel: "Delete the subject",
                },
                onSelect: () => remove.mutate(subject.id),
              },
            ]}
          />
        ),
      })),
    [visible, remove, setTaught],
  );

  const narrowed = [
    typeFilter === "core" ? "Core" : typeFilter === "elective" ? "Elective" : "",
    statusFilter === "active"
      ? "Currently taught"
      : statusFilter === "retired"
        ? "Retired"
        : "",
  ].filter(Boolean);

  const clearFilters = () => {
    setTypeFilter("");
    setStatusFilter("");
    setSearch("");
  };

  return (
    <div className="space-y-4">
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
      {seed.error ? (
        <SaveError what="The standard subjects" error={seed.error} />
      ) : null}

      <TableControls
        search={
          <TableSearch
            value={search}
            onChange={setSearch}
            placeholder="Search name or code"
          />
        }
        filterCount={activeFilterCount(typeFilter, statusFilter)}
        filters={
          <>
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
          </>
        }
        count={
          subjectsQuery.isLoading ? null : `${visible.length} of ${subjects.length}`
        }
        actions={
          <CreateButton
            resource="schools.academics"
            label="New subject"
            onSelect={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          />
        }
      />

      {subjectsQuery.isLoading ? (
        <ListRowsSkeleton rows={8} label="Reading the catalogue" />
      ) : subjects.length === 0 ? (
        <NothingYet
          title="Nothing on the catalogue yet"
          body="A subject is what the school teaches — Mathematics, English Language, Combined Science, Shona, Geography, History, Latin. Timetable slots, mark sheets and report cards all name one. Add the standard catalogue in one press, or enter your own."
          /* The seeder is offered here and nowhere else. Once a school has
             its subjects, a standing "add the standard ones" button beside
             the rows is a way to create twenty-two duplicates. */
          action={
            <CreateButton
              resource="schools.academics"
              label="Add the standard subjects"
              onSelect={() => setStandardOpen(true)}
            />
          }
        />
      ) : visible.length === 0 ? (
        <NothingMatched
          what="subjects"
          filters={narrowed}
          search={search}
          onClear={clearFilters}
        />
      ) : (
        <RecordList rows={rows} />
      )}

      <AddStandardSubjectsDialog
        open={standardOpen}
        onOpenChange={(open) => {
          setStandardOpen(open);
          if (!open) seed.reset();
        }}
        existingCodes={subjects.map((row) => row.code)}
        existingNames={subjects.map((row) => row.name)}
        isSubmitting={seed.isPending}
        error={seed.error ? getApiErrorMessage(seed.error) : null}
        onSubmit={(chosen) => seed.mutate(chosen)}
      />

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
