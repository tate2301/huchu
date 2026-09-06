"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Alert, AlertDescription, AlertTitle } from "@corelithzw/ui/components/alert";
import { Badge } from "@corelithzw/ui/components/badge";
import { Button } from "@corelithzw/ui/components/button";
import { Checkbox } from "@corelithzw/ui/components/checkbox";
import { Input } from "@corelithzw/ui/components/input";
import { RecordDialog } from "@/components/crm/records/record-dialog";
import { getApiErrorMessage } from "@corelithzw/platform/api-client";
import { gradeFor, DEFAULT_GRADING_BANDS } from "@/lib/schools/grading";
import {
  fetchMarkSheet,
  saveMarkSheet,
  type MarkSheetRow,
} from "@/lib/schools/assessments-v2";

type Draft = { score: string; isAbsent: boolean };

function initialDraft(rows: MarkSheetRow[]) {
  const draft: Record<string, Draft> = {};
  for (const row of rows) {
    draft[row.student.id] = {
      score: row.score === null ? "" : String(row.score),
      isAbsent: row.isAbsent,
    };
  }
  return draft;
}

/**
 * Entering a page of marks.
 *
 * The whole class at once and one save, because that is how a pile of scripts
 * is marked. Saving per row would turn a lost connection into a half-entered
 * sheet nobody can tell from a half-marked one.
 *
 * The percentage and provisional grade appear as the number is typed. A mark
 * out of 20 does not tell a teacher whether it is a pass, and the arithmetic
 * she would otherwise do in her head is the arithmetic this module exists for.
 * The grade shown is from the built-in table — it is an indication while
 * typing, not the grade that goes on the report, which comes from the school's
 * own scheme when the marks are rolled up.
 */
export function MarkEntrySheet({
  assessmentId,
  open,
  onOpenChange,
}: {
  assessmentId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Record<string, Draft>>({});
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sheetQuery = useQuery({
    queryKey: ["schools", "assessments", "sheet", assessmentId],
    queryFn: () => fetchMarkSheet(assessmentId as string),
    enabled: open && Boolean(assessmentId),
  });

  // Seed the draft from the fetched sheet, during render rather than in an
  // effect — an effect here would paint one frame of empty inputs over marks
  // that already exist.
  const sheet = sheetQuery.data ?? null;
  if (sheet && loadedFor !== sheet.assessment.id) {
    setLoadedFor(sheet.assessment.id);
    setDraft(initialDraft(sheet.rows));
  }
  if (!open && loadedFor !== null) {
    setLoadedFor(null);
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!sheet) return { saved: 0 };
      return saveMarkSheet(
        sheet.assessment.id,
        sheet.rows.map((row) => {
          const entry = draft[row.student.id] ?? { score: "", isAbsent: false };
          const parsed = entry.score.trim() === "" ? null : Number(entry.score);
          return {
            studentId: row.student.id,
            score: entry.isAbsent || parsed === null || Number.isNaN(parsed) ? null : parsed,
            isAbsent: entry.isAbsent,
          };
        }),
      );
    },
    onSuccess: () => {
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ["schools", "assessments"] });
      onOpenChange(false);
    },
    onError: (mutationError) => setError(getApiErrorMessage(mutationError)),
  });

  const maxScore = sheet ? Number(sheet.assessment.maxScore) : 100;
  const locked = sheet?.assessment.status === "LOCKED";
  const entered = sheet
    ? sheet.rows.filter((row) => {
        const entry = draft[row.student.id];
        return entry && (entry.isAbsent || entry.score.trim() !== "");
      }).length
    : 0;

  return (
    <RecordDialog
      open={open}
      onOpenChange={onOpenChange}
      title={
        sheet
          ? `${sheet.assessment.classSubject.subject.name} — ${sheet.assessment.title}`
          : "Marks"
      }
      description={
        sheet
          ? `${sheet.assessment.classSubject.class.name}${
              sheet.assessment.classSubject.stream
                ? ` ${sheet.assessment.classSubject.stream.name}`
                : ""
            } · out of ${maxScore}`
          : "Loading…"
      }
      size="lg"
      errors={error ? [error] : undefined}
      onSubmit={(event) => {
        event.preventDefault();
        if (!locked && !saveMutation.isPending) saveMutation.mutate();
      }}
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-sm text-muted-foreground">
            {entered} of {sheet?.rows.length ?? 0} marked
          </span>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saveMutation.isPending}
            >
              Close
            </Button>
            <Button type="submit" disabled={locked || saveMutation.isPending}>
              {saveMutation.isPending ? "Saving…" : "Save marks"}
            </Button>
          </div>
        </div>
      }
    >
      {/* In the body rather than in `description`, which the design system
          renders `sr-only`. "Out of 20" is the number every mark on this sheet
          is entered against. */}
      {sheet ? (
        <p className="text-sm text-muted-foreground">
          {sheet.assessment.classSubject.class.name}
          {sheet.assessment.classSubject.stream
            ? ` ${sheet.assessment.classSubject.stream.name}`
            : ""}{" "}
          · out of {maxScore}
        </p>
      ) : null}

      {sheetQuery.error ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to load the mark sheet</AlertTitle>
          <AlertDescription>{getApiErrorMessage(sheetQuery.error)}</AlertDescription>
        </Alert>
      ) : null}

      {locked ? (
        <Alert>
          <AlertTitle>Locked</AlertTitle>
          <AlertDescription>
            These marks have been closed. Reopen the assessment to change them.
          </AlertDescription>
        </Alert>
      ) : null}

      {sheetQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading the class list…</p>
      ) : null}

      <div className="space-y-1">
        {(sheet?.rows ?? []).map((row) => {
          const entry = draft[row.student.id] ?? { score: "", isAbsent: false };
          const parsed = entry.score.trim() === "" ? null : Number(entry.score);
          const percent =
            parsed === null || Number.isNaN(parsed)
              ? null
              : Math.round((parsed / maxScore) * 1000) / 10;
          const band = percent === null ? null : gradeFor(DEFAULT_GRADING_BANDS, percent);
          const overMax = parsed !== null && parsed > maxScore;

          return (
            <div
              key={row.student.id}
              className="flex flex-wrap items-center gap-3 border-b border-[var(--edge-subtle)] py-2 last:border-0"
            >
              <span className="min-w-0 flex-1 text-sm">
                {row.student.lastName}, {row.student.firstName}
                <span className="block text-muted-foreground">
                  {row.student.studentNo}
                </span>
              </span>

              <Input
                aria-label={`Mark for ${row.student.lastName}`}
                className="w-24"
                type="number"
                min={0}
                max={maxScore}
                inputMode="decimal"
                disabled={locked || entry.isAbsent}
                value={entry.score}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    [row.student.id]: {
                      ...entry,
                      score: event.target.value,
                    },
                  }))
                }
              />

              <span className="w-28 text-sm text-muted-foreground">
                {overMax ? (
                  <span className="text-[var(--danger-fg,inherit)]">over {maxScore}</span>
                ) : percent === null ? (
                  entry.isAbsent ? "absent" : "—"
                ) : (
                  <>
                    {percent}%{band ? <Badge variant="outline">{band.grade}</Badge> : null}
                  </>
                )}
              </span>

              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <Checkbox
                  checked={entry.isAbsent}
                  disabled={locked}
                  onCheckedChange={(checked) =>
                    setDraft((current) => ({
                      ...current,
                      [row.student.id]: {
                        score: checked === true ? "" : entry.score,
                        isAbsent: checked === true,
                      },
                    }))
                  }
                />
                Absent
              </label>
            </div>
          );
        })}
      </div>
    </RecordDialog>
  );
}
