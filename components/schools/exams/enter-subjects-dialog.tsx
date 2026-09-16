"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Badge } from "@corelithzw/react";

import { RecordDialog } from "@/components/crm/records/record-dialog";
import { SavingOverlay } from "@/components/records/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getApiErrorMessage } from "@/lib/api-client";
import { SUBJECT_RULE } from "@/lib/schools/exam-grades";
import {
  EXAM_LEVEL_LABELS,
  enterSubject,
  fetchCandidates,
  fetchExamReference,
  fetchSeries,
  type ExamLevel,
} from "@/lib/schools/exams-v2";
import { formatSchoolMoney } from "@/lib/schools/format";

/**
 * `Enter a subject` — one candidate, several subjects, one pass.
 *
 * Without this the exams module stops at a registered cohort: candidates exist,
 * nothing is entered for anything, and the invoice, the entry file, the seating
 * and the results all read an empty series. It is entered per candidate because
 * that is how a school decides — a Form 4 pupil's eight subjects are chosen
 * together, against the six-to-nine rule, in one conversation.
 *
 * The rule is shown as the boxes are ticked rather than enforced on save. Six
 * is the school's own floor and nine its ceiling, not the board's, and a
 * registrar entering a seventh subject for a good reason should not be stopped
 * by a screen — they should be able to see that they are doing it.
 *
 * The fee is the series' own, and the dialog says which one applies: past the
 * board's deadline every entry carries the late fee instead, and that is a
 * number somebody has to be told before they tick eight boxes.
 */
export function EnterSubjectsDialog({
  open,
  onOpenChange,
  seriesId,
  onSaved,
  onError,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  seriesId: string;
  onSaved: (entered: number) => void;
  onError?: (message: string) => void;
}) {
  const [candidateId, setCandidateId] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setCandidateId("");
      setPicked([]);
      setSearch("");
      setError(null);
    }
  }

  const seriesQuery = useQuery({
    queryKey: ["schools", "exams", "series", seriesId],
    queryFn: () => fetchSeries(seriesId),
    enabled: open,
  });

  const candidatesQuery = useQuery({
    queryKey: ["schools", "exams", "candidates", seriesId, search],
    queryFn: () => fetchCandidates(seriesId, { search: search.trim() || undefined }),
    enabled: open,
  });

  const referenceQuery = useQuery({
    queryKey: ["schools", "exams", "reference"],
    queryFn: fetchExamReference,
    enabled: open,
  });

  const series = seriesQuery.data?.series;
  const candidate = candidatesQuery.data?.rows.find((row) => row.id === candidateId);

  // The board's subjects at this series' level. A Cambridge code offered on a
  // ZIMSEC series is an entry the board will reject.
  const subjects = useMemo(() => {
    const all = referenceQuery.data?.subjects ?? [];
    if (!series) return all;
    return all.filter(
      (subject) => subject.boardId === series.board.id && subject.level === series.level,
    );
  }, [referenceQuery.data, series]);

  const late = Boolean(
    series?.entriesCloseAt && new Date(series.entriesCloseAt) < new Date(),
  );
  const fee = late ? series?.lateFeePerSubject : series?.feePerSubject;
  const total = fee ? Number(fee) * picked.length : 0;
  const already = candidate?.subjects ?? 0;
  const after = already + picked.length;

  const save = useMutation({
    mutationFn: async () => {
      // One request per subject: the endpoint takes one entry, and a failure
      // part-way leaves the entries that went in rather than losing the lot.
      // The count that comes back is what the page reports.
      let entered = 0;
      for (const examSubjectId of picked) {
        await enterSubject(seriesId, { candidateId, examSubjectId });
        entered += 1;
      }
      return entered;
    },
    onSuccess: (entered) => {
      setError(null);
      onSaved(entered);
    },
    onError: (mutationError) => {
      const message = getApiErrorMessage(mutationError);
      setError(message);
      onError?.(message);
    },
  });

  const canSubmit = candidateId.length > 0 && picked.length > 0;

  return (
    <RecordDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Enter a candidate for subjects"
      description="The subjects this candidate sits, and what they cost."
      size="lg"
      errors={error ? [error] : undefined}
      onSubmit={(event) => {
        event.preventDefault();
        if (canSubmit && !save.isPending) save.mutate();
      }}
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={save.isPending}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={!canSubmit || save.isPending}>
            {save.isPending
              ? "Entering…"
              : picked.length > 0
                ? `Enter ${picked.length} ${picked.length === 1 ? "subject" : "subjects"}`
                : "Enter them"}
          </Button>
        </div>
      }
    >
      <SavingOverlay saving={save.isPending} label="Writing the entries">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="entry-candidate-search">Candidate</Label>
            <Input
              id="entry-candidate-search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search a name or a candidate number"
            />
            <Select
              value={candidateId}
              onValueChange={(next) => {
                setCandidateId(next);
                setPicked([]);
              }}
            >
              <SelectTrigger id="entry-candidate">
                <SelectValue
                  placeholder={
                    candidatesQuery.isPending ? "Reading the roll…" : "Pick a candidate"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {(candidatesQuery.data?.rows ?? []).map((row) => (
                  <SelectItem key={row.id} value={row.id}>
                    {row.candidateNumber ?? "—"} · {row.student.lastName},{" "}
                    {row.student.firstName} · {row.subjects} entered
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {candidate && candidate.blockers.length > 0 ? (
              // Not a refusal. A candidate with a missing birth certificate can
              // still be entered for subjects — the blocker stops the entry
              // FILE, and the office often fixes it after the subjects are set.
              <p className="text-xs text-[color:var(--tone-warn)]">
                {candidate.blockers[0]} — the entry file will not take this candidate until that
                is fixed, but the subjects can be set now.
              </p>
            ) : null}
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">
              Subjects
              {series ? (
                <span className="ml-2 font-normal text-[color:var(--text-muted)]">
                  {series.board.name} · {EXAM_LEVEL_LABELS[series.level as ExamLevel]}
                </span>
              ) : null}
            </legend>
            {subjects.length === 0 ? (
              <p className="text-sm text-[color:var(--text-muted)]">
                This board has no subjects set up at this level yet. A subject carries the
                board&rsquo;s own syllabus code — ZIMSEC Mathematics is 4008 — so they are added
                per board rather than taken from the school&rsquo;s own list.
              </p>
            ) : (
              <div className="grid gap-1 sm:grid-cols-2">
                {subjects.map((subject) => (
                  <label
                    key={subject.id}
                    className="flex items-center gap-2 rounded-[var(--radius-sm)] px-1 py-0.5 text-sm hover:bg-[color:var(--surface-hover)]"
                  >
                    <input
                      type="checkbox"
                      checked={picked.includes(subject.id)}
                      onChange={(event) =>
                        setPicked((current) =>
                          event.target.checked
                            ? [...current, subject.id]
                            : current.filter((id) => id !== subject.id),
                        )
                      }
                    />
                    <span className="min-w-0 flex-1 truncate">{subject.name}</span>
                    <span className="font-mono text-xs text-[color:var(--text-muted)]">
                      {subject.code}
                    </span>
                  </label>
                ))}
              </div>
            )}
          </fieldset>

          {candidateId ? (
            <div className="flex flex-wrap items-center gap-2 rounded-[var(--radius-md)] bg-[color:var(--surface-muted)] p-2 text-xs">
              <span>
                {already} already entered, {picked.length} being added —{" "}
                <strong>{after} in total</strong>
              </span>
              {after < SUBJECT_RULE.minimum ? (
                <Badge tone="danger">Below the minimum of {SUBJECT_RULE.minimum}</Badge>
              ) : after > SUBJECT_RULE.maximum ? (
                <Badge tone="warn">Over the school maximum of {SUBJECT_RULE.maximum}</Badge>
              ) : (
                <Badge tone="success">Inside the rule</Badge>
              )}
              {fee ? (
                <span className="ml-auto font-mono">
                  {formatSchoolMoney(String(total))}
                  {late ? " · at the late fee" : ""}
                </span>
              ) : null}
            </div>
          ) : null}

          {late ? (
            <p className="text-xs text-[color:var(--tone-warn)]">
              The board&rsquo;s deadline for this series has passed, so every entry carries the
              late fee. Past the late deadline the board takes nothing at all.
            </p>
          ) : null}
        </div>
      </SavingOverlay>
    </RecordDialog>
  );
}
