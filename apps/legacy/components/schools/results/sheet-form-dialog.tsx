"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@corelithzw/react";

import { RecordDialog } from "@/components/crm/records/record-dialog";
import { Input } from "@corelithzw/ui/components/input";
import { Label } from "@corelithzw/ui/components/label";
import { SearchableSelect } from "@corelithzw/ui/components/searchable-select";
import { getApiErrorMessage } from "@corelithzw/platform/api-client";
import { fetchSchoolsClasses, fetchSchoolsSubjects, fetchSchoolsTerms } from "@/lib/schools/admin-v2";
import {
  createResultSheet,
  updateResultSheet,
  type ResultSheetLike,
} from "@/lib/schools/results-v2";

/**
 * Raise a mark sheet, or correct one.
 *
 * A sheet is a term, a class, optionally a stream, and a name. The name is what
 * everybody reads it by — "Mathematics — end of term" — so the subject picker
 * writes the first half of it rather than making a teacher type a subject the
 * school already has on file. Term, class and stream are pickers fed by the
 * lists that own them; nowhere here does anybody paste an id.
 *
 * Scope only moves while the sheet is a draft, which is the rule the PATCH
 * route enforces: once a head of department has seen it, moving it to another
 * class would silently rewrite what they signed off.
 */

export type SheetFormDialogProps = {
  onOpenChange: (open: boolean) => void;
  /** The sheet being corrected, or null to raise a new one. */
  sheet?: ResultSheetLike | null;
  /** Pre-selected scope when the screen already knows the class. */
  defaultClassId?: string;
  defaultStreamId?: string;
};

/**
 * Mounted only while it is open, and keyed by the record it is editing, so its
 * answers come from `useState` initialisers rather than an effect that resets
 * them — an effect that writes state on open is a cascading render, and React
 * says so out loud.
 */
export function SheetFormDialog({
  onOpenChange,
  sheet = null,
  defaultClassId,
  defaultStreamId,
}: SheetFormDialogProps) {
  const queryClient = useQueryClient();
  const [termId, setTermId] = useState(sheet?.term.id ?? "");
  const [classId, setClassId] = useState(sheet?.class.id ?? defaultClassId ?? "");
  const [streamId, setStreamId] = useState(sheet?.stream?.id ?? defaultStreamId ?? "");
  const [title, setTitle] = useState(sheet?.title ?? "");
  const [error, setError] = useState<string | null>(null);

  const termsQuery = useQuery({
    queryKey: ["schools", "terms"],
    queryFn: () => fetchSchoolsTerms({ page: 1, limit: 100 }),
  });
  const classesQuery = useQuery({
    queryKey: ["schools", "grades"],
    queryFn: () => fetchSchoolsClasses({ page: 1, limit: 100 }),
  });
  const subjectsQuery = useQuery({
    queryKey: ["schools", "subjects"],
    queryFn: () => fetchSchoolsSubjects({ page: 1, limit: 100, isActive: true }),
  });

  const terms = useMemo(() => termsQuery.data?.data ?? [], [termsQuery.data]);
  const classes = useMemo(() => classesQuery.data?.data ?? [], [classesQuery.data]);
  const subjects = useMemo(() => subjectsQuery.data?.data ?? [], [subjectsQuery.data]);
  const streams = useMemo(
    () => classes.find((row) => row.id === classId)?.streams ?? [],
    [classes, classId],
  );

  // The current term is the answer nine times in ten, but the term list arrives
  // after the first render — so the default is derived rather than written into
  // state once it lands.
  const activeTermId = terms.find((term) => term.isActive)?.id ?? "";
  const chosenTermId = termId || activeTermId;

  const editingScope = !sheet || sheet.status === "DRAFT";

  const mutation = useMutation({
    mutationFn: () => {
      const trimmed = title.trim();
      if (sheet) {
        return updateResultSheet(sheet.id, {
          title: trimmed,
          ...(editingScope
            ? { termId: chosenTermId, classId, streamId: streamId || null }
            : {}),
        });
      }
      return createResultSheet({
        termId: chosenTermId,
        classId,
        streamId: streamId || null,
        title: trimmed,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["schools", "results"] });
      onOpenChange(false);
    },
    onError: (cause: unknown) => setError(getApiErrorMessage(cause)),
  });

  const missing: string[] = [];
  if (!chosenTermId) missing.push("Choose the term the sheet belongs to.");
  if (!classId) missing.push("Choose the year group.");
  if (!title.trim()) missing.push("Give the sheet a name.");

  return (
    <RecordDialog
      open
      onOpenChange={onOpenChange}
      size="md"
      title={sheet ? "Edit this mark sheet" : "New mark sheet"}
      description={
        sheet
          ? "The name is what everybody reads the sheet by."
          : "A sheet holds one class's marks for one term, ready for moderation."
      }
      errors={error ? [error] : undefined}
      onSubmit={(event) => {
        event.preventDefault();
        if (missing.length > 0) {
          setError(missing[0]);
          return;
        }
        mutation.mutate();
      }}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={mutation.isPending}>
            {sheet ? "Save the changes" : "Raise the sheet"}
          </Button>
        </>
      }
    >
      <SearchableSelect
        label="Term"
        value={chosenTermId}
        placeholder={termsQuery.isLoading ? "Loading terms…" : "Which term?"}
        options={terms.map((term) => ({
          value: term.id,
          label: term.name,
          description: term.academicYear.name,
          meta: term.isActive ? "Current" : undefined,
        }))}
        onValueChange={setTermId}
        disabled={!editingScope}
      />

      <SearchableSelect
        label="Year group"
        value={classId}
        placeholder={classesQuery.isLoading ? "Loading year groups…" : "Which year group?"}
        options={classes.map((row) => ({
          value: row.id,
          label: row.name,
          description: row.code,
          meta: `${row._count.students} pupils`,
        }))}
        onValueChange={(next) => {
          setClassId(next);
          setStreamId("");
        }}
        disabled={!editingScope}
      />

      {streams.length > 0 ? (
        <SearchableSelect
          label="Class"
          value={streamId}
          placeholder="The whole year group"
          options={streams.map((stream) => ({ value: stream.id, label: stream.name }))}
          onValueChange={setStreamId}
          disabled={!editingScope}
        />
      ) : null}

      <div className="space-y-1.5">
        <Label htmlFor="sheet-title">Name of the sheet</Label>
        <Input
          id="sheet-title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Mathematics — end of term"
          maxLength={200}
        />
        {subjects.length > 0 && !sheet ? (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {subjects.slice(0, 12).map((subject) => (
              <Button
                key={subject.id}
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setTitle(`${subject.name} — end of term`)}
              >
                {subject.name}
              </Button>
            ))}
          </div>
        ) : null}
      </div>

      {!editingScope ? (
        <p className="text-xs text-muted-foreground">
          Term, year group and class are fixed once a sheet leaves draft — moving
          it would rewrite what the head of department signed off.
        </p>
      ) : null}
    </RecordDialog>
  );
}
