"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@corelithzw/react";

import { RecordDialog } from "@/components/crm/records/record-dialog";
import { FilterSelect } from "@/components/schools/common/filter-select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Textarea } from "@/components/ui/textarea";
import { getApiErrorMessage } from "@/lib/api-client";
import { fetchSchoolsClasses, fetchSchoolsTerms } from "@/lib/schools/admin-v2";
import {
  createPublishWindow,
  updatePublishWindow,
  type PublishWindowRecord,
} from "@/lib/schools/results-v2";
import { WINDOW_STATE_OPTIONS } from "@/components/schools/results/sheet-state";

/**
 * When marks are allowed out.
 *
 * A window is a term, a scope and two moments. Both moments are wall-clock
 * times a school thinks in — "opens Monday at eight" — so the fields are
 * `datetime-local` and the conversion to the ISO the endpoint validates happens
 * here rather than in anybody's head.
 */

/** An ISO instant as the value a `datetime-local` input wants. */
function toLocalInput(iso?: string | null) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function toIso(local: string) {
  if (!local) return "";
  const date = new Date(local);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

/**
 * Mounted only while it is open, and keyed by the window it is editing, so its
 * answers come from `useState` initialisers rather than an effect that resets
 * them on open.
 */
export function PublishWindowDialog({
  onOpenChange,
  window: editing = null,
}: {
  onOpenChange: (open: boolean) => void;
  window?: PublishWindowRecord | null;
}) {
  const queryClient = useQueryClient();
  const [termId, setTermId] = useState(editing?.term.id ?? "");
  const [classId, setClassId] = useState(editing?.class?.id ?? "");
  const [streamId, setStreamId] = useState(editing?.stream?.id ?? "");
  const [openAt, setOpenAt] = useState(toLocalInput(editing?.openAt));
  const [closeAt, setCloseAt] = useState(toLocalInput(editing?.closeAt));
  const [status, setStatus] = useState<string>(editing?.status ?? "SCHEDULED");
  const [notes, setNotes] = useState(editing?.notes ?? "");
  const [error, setError] = useState<string | null>(null);

  const termsQuery = useQuery({
    queryKey: ["schools", "terms"],
    queryFn: () => fetchSchoolsTerms({ page: 1, limit: 100 }),
  });
  const classesQuery = useQuery({
    queryKey: ["schools", "grades"],
    queryFn: () => fetchSchoolsClasses({ page: 1, limit: 100 }),
  });

  const terms = useMemo(() => termsQuery.data?.data ?? [], [termsQuery.data]);
  const classes = useMemo(() => classesQuery.data?.data ?? [], [classesQuery.data]);
  const streams = useMemo(
    () => classes.find((row) => row.id === classId)?.streams ?? [],
    [classes, classId],
  );

  // The term list arrives after the first render, so the current term is
  // derived as the default rather than written into state when it lands.
  const chosenTermId = termId || (terms.find((term) => term.isActive)?.id ?? "");

  const mutation = useMutation({
    mutationFn: () => {
      const payload = {
        classId: classId || null,
        streamId: streamId || null,
        openAt: toIso(openAt),
        closeAt: toIso(closeAt),
        status: status as PublishWindowRecord["status"],
        notes: notes.trim() || null,
      };
      if (editing) return updatePublishWindow(editing.id, payload);
      return createPublishWindow({ termId: chosenTermId, ...payload });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["schools", "results"] });
      onOpenChange(false);
    },
    onError: (cause: unknown) => setError(getApiErrorMessage(cause)),
  });

  const problems: string[] = [];
  if (!chosenTermId) problems.push("Choose the term the window belongs to.");
  if (!openAt) problems.push("Say when the window opens.");
  if (!closeAt) problems.push("Say when the window closes.");
  if (openAt && closeAt && new Date(closeAt) <= new Date(openAt)) {
    problems.push("A window has to close after it opens.");
  }
  if (streamId && !classId) problems.push("A class needs its year group named too.");

  return (
    <RecordDialog
      open
      onOpenChange={onOpenChange}
      size="md"
      title={editing ? "Edit this publish window" : "New publish window"}
      description="Approved sheets can only be released while a window covering them is open."
      errors={error ? [error] : undefined}
      onSubmit={(event) => {
        event.preventDefault();
        if (problems.length > 0) {
          setError(problems[0]);
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
            {editing ? "Save the window" : "Open the window"}
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
        disabled={Boolean(editing)}
      />

      {/* Scope is optional — a window with no class covers the whole school —
          so these are the filter dropdown, which already carries an "all"
          choice, rather than a picker that has to invent one. */}
      <FilterSelect
        label="Year group"
        allLabel="Every year group"
        value={classId}
        options={classes.map((row) => ({ value: row.id, label: row.name }))}
        onChange={(next) => {
          setClassId(next);
          setStreamId("");
        }}
        className="min-w-0"
      />

      {streams.length > 0 ? (
        <FilterSelect
          label="Class"
          allLabel="The whole year group"
          value={streamId}
          options={streams.map((stream) => ({ value: stream.id, label: stream.name }))}
          onChange={setStreamId}
          className="min-w-0"
        />
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="window-open">Opens</Label>
          <Input
            id="window-open"
            type="datetime-local"
            value={openAt}
            onChange={(event) => setOpenAt(event.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="window-close">Closes</Label>
          <Input
            id="window-close"
            type="datetime-local"
            value={closeAt}
            onChange={(event) => setCloseAt(event.target.value)}
          />
        </div>
      </div>

      <FilterSelect
        label="State"
        allLabel="Scheduled"
        value={status}
        options={WINDOW_STATE_OPTIONS}
        onChange={(next) => setStatus(next || "SCHEDULED")}
        className="min-w-0"
      />

      <div className="space-y-1.5">
        <Label htmlFor="window-notes">Notes</Label>
        <Textarea
          id="window-notes"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          rows={3}
          maxLength={1000}
          placeholder="Mocks — released to families early"
        />
      </div>
    </RecordDialog>
  );
}
