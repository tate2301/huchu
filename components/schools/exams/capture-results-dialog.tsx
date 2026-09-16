"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";

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
import { A_LEVEL_GRADES, O_LEVEL_GRADES } from "@/lib/schools/exam-grades";
import {
  captureResults,
  fetchCandidates,
  fetchEntries,
  fetchSeries,
} from "@/lib/schools/exams-v2";

/**
 * Capture results off the board's statement.
 *
 * One candidate at a time, every subject they were entered for on screen at
 * once — because that is the shape of the envelope: a statement arrives per
 * candidate with a row per subject, and a form that asked for one grade at a
 * time would be typed against the wrong child by the third page.
 *
 * The grade list is the level's own: A* through U at Ordinary Level and IGCSE,
 * A through U at Advanced. A dropdown that offered `A*` to an A Level candidate
 * would be offering a grade the board does not award.
 */
export function CaptureResultsDialog({
  open,
  onOpenChange,
  seriesId,
  onSaved,
  onError,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  seriesId: string;
  onSaved: () => void;
  /** Lifted to the page as well: a dialog that closes takes its own error with it. */
  onError?: (message: string) => void;
}) {
  const [candidateId, setCandidateId] = useState("");
  const [grades, setGrades] = useState<Record<string, string>>({});
  const [points, setPoints] = useState<Record<string, string>>({});
  const [isRemark, setIsRemark] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setCandidateId("");
      setGrades({});
      setPoints({});
      setIsRemark(false);
      setError(null);
    }
  }

  const seriesQuery = useQuery({
    queryKey: ["schools", "exams", "series", seriesId],
    queryFn: () => fetchSeries(seriesId),
    enabled: open,
  });

  const candidatesQuery = useQuery({
    queryKey: ["schools", "exams", "candidates", seriesId],
    queryFn: () => fetchCandidates(seriesId),
    enabled: open,
  });

  const entriesQuery = useQuery({
    queryKey: ["schools", "exams", "entries", seriesId],
    queryFn: () => fetchEntries(seriesId),
    enabled: open,
  });

  const level = seriesQuery.data?.series.level ?? "O_LEVEL";
  const gradeSet = level === "A_LEVEL" ? A_LEVEL_GRADES : O_LEVEL_GRADES;

  // Which subjects this candidate is entered for. The dialog cannot know from
  // the subject table alone, so it reads the by-candidate view and matches.
  const subjects = useMemo(() => entriesQuery.data?.bySubject ?? [], [entriesQuery.data]);

  const save = useMutation({
    mutationFn: () =>
      captureResults(
        seriesId,
        Object.entries(grades)
          .filter(([, grade]) => grade)
          .map(([examSubjectId, grade]) => ({
            candidateId,
            examSubjectId,
            grade,
            points: points[examSubjectId] ? Number(points[examSubjectId]) : null,
            isRemark,
          })),
      ),
    onSuccess: () => {
      setError(null);
      onSaved();
    },
    onError: (mutationError) => {
      const message = getApiErrorMessage(mutationError);
      setError(message);
      onError?.(message);
    },
  });

  const captured = Object.values(grades).filter(Boolean).length;
  const canSubmit = candidateId.length > 0 && captured > 0;

  return (
    <RecordDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Capture results"
      description="One candidate, every subject they sat. A grade, and no score."
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
            {save.isPending ? "Saving…" : `Capture ${captured || ""}`.trim()}
          </Button>
        </div>
      }
    >
      <SavingOverlay saving={save.isPending} label="Writing the grades">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="capture-candidate">Candidate</Label>
            <Select value={candidateId} onValueChange={setCandidateId}>
              <SelectTrigger id="capture-candidate">
                <SelectValue
                  placeholder={candidatesQuery.isPending ? "Reading the roll…" : "Pick a candidate"}
                />
              </SelectTrigger>
              <SelectContent>
                {(candidatesQuery.data?.rows ?? []).map((candidate) => (
                  <SelectItem key={candidate.id} value={candidate.id}>
                    {candidate.candidateNumber ?? "—"} · {candidate.student.lastName},{" "}
                    {candidate.student.firstName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Grades</legend>
            <div className="space-y-2">
              {subjects.map((subject) => (
                <div key={subject.examSubjectId} className="flex flex-wrap items-end gap-2">
                  <span className="min-w-[180px] flex-1 text-sm">
                    {subject.subject}{" "}
                    <span className="font-mono text-xs text-[color:var(--text-muted)]">
                      {subject.code}
                    </span>
                  </span>
                  <Select
                    value={grades[subject.examSubjectId] ?? ""}
                    onValueChange={(next) =>
                      setGrades((current) => ({ ...current, [subject.examSubjectId]: next }))
                    }
                  >
                    <SelectTrigger className="w-[110px]">
                      <SelectValue placeholder="Grade" />
                    </SelectTrigger>
                    <SelectContent>
                      {gradeSet.map((grade) => (
                        <SelectItem key={grade} value={grade}>
                          {grade}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {level === "A_LEVEL" ? (
                    <Input
                      className="w-[90px]"
                      type="number"
                      min={0}
                      max={20}
                      placeholder="Points"
                      value={points[subject.examSubjectId] ?? ""}
                      onChange={(event) =>
                        setPoints((current) => ({
                          ...current,
                          [subject.examSubjectId]: event.target.value,
                        }))
                      }
                    />
                  ) : null}
                </div>
              ))}
              {subjects.length === 0 ? (
                <p className="text-sm text-[color:var(--text-muted)]">
                  Nothing was entered for this series, so there is nothing to grade.
                </p>
              ) : null}
            </div>
          </fieldset>

          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              className="mt-1"
              checked={isRemark}
              onChange={(event) => setIsRemark(event.target.checked)}
            />
            <span className="text-sm">
              These came back after a remark or an appeal
              <span className="block text-xs text-[color:var(--text-muted)]">
                Kept beside the original rather than over it, so &ldquo;grades amended&rdquo; can
                be counted and the first grade is still on the record.
              </span>
            </span>
          </label>
        </div>
      </SavingOverlay>
    </RecordDialog>
  );
}
