"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";

import { RecordDialog } from "@/components/crm/records/record-dialog";
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
import {
  addTimetablePaper,
  fetchExamReference,
  fetchSeries,
} from "@/lib/schools/exams-v2";

/**
 * `Add a paper` — one row of the board's timetable.
 *
 * Four questions, because that is all the board's timetable tells a school:
 * which subject, which paper, when it sits, how long it runs. The syllabus code
 * is offered as `4008/1` and left editable, because it is what an invigilator
 * reads off the question paper to check they have the right pile and not every
 * board spells it that way.
 *
 * The subject list is filtered to this series' own board and level. A Cambridge
 * IGCSE subject on a ZIMSEC O-Level series is a row the board will reject, and
 * the place to find that out is here rather than in November — the server
 * refuses it too, because a dialog is not a rule.
 */
export function AddPaperDialog({
  seriesId,
  open,
  onOpenChange,
  onAdded,
}: {
  seriesId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdded: () => void;
}) {
  const [examSubjectId, setExamSubjectId] = useState("");
  const [paperNumber, setPaperNumber] = useState("1");
  const [code, setCode] = useState("");
  const [sitsAt, setSitsAt] = useState("");
  const [hours, setHours] = useState("");
  const [minutes, setMinutes] = useState("");
  const [error, setError] = useState<string | null>(null);

  /*
    There is no reset in here, and that is deliberate.

    A dialog that keeps its last answers will, on the second open, submit a
    subject the reader did not choose — and on this screen the reader is
    copying a list of twenty papers in a row, so the second open is the one
    that matters. The fix is for the caller to mount a fresh one: it passes
    `key={...}` keyed on the open state, so every open starts from these
    initial values and a close by Escape or by clicking away is covered too.
    Clearing the fields in an effect would do the same job one cascading
    render later, which is what `react-hooks/set-state-in-effect` is about.
  */

  const seriesQuery = useQuery({
    queryKey: ["schools", "exams", "series", seriesId],
    queryFn: () => fetchSeries(seriesId),
    enabled: open,
  });

  const referenceQuery = useQuery({
    queryKey: ["schools", "exams", "reference"],
    queryFn: fetchExamReference,
    enabled: open,
  });

  const subjects = useMemo(() => {
    const series = seriesQuery.data?.series;
    const all = referenceQuery.data?.subjects ?? [];
    if (!series) return [];
    return all
      .filter(
        (subject) => subject.boardId === series.board.id && subject.level === series.level,
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [referenceQuery.data, seriesQuery.data]);

  const chosen = subjects.find((subject) => subject.id === examSubjectId);
  const suggestedCode = chosen ? `${chosen.code}/${paperNumber || "1"}` : "";

  const durationMinutes = useMemo(() => {
    const h = Number(hours || 0);
    const m = Number(minutes || 0);
    const total = h * 60 + m;
    return total > 0 ? total : null;
  }, [hours, minutes]);

  const save = useMutation({
    mutationFn: () =>
      addTimetablePaper(seriesId, {
        examSubjectId,
        paperNumber: Number(paperNumber),
        code: code.trim() || null,
        sitsAt: new Date(sitsAt).toISOString(),
        durationMinutes,
      }),
    onSuccess: () => {
      setError(null);
      onAdded();
      onOpenChange(false);
    },
    onError: (cause) => setError(getApiErrorMessage(cause)),
  });

  const ready = examSubjectId !== "" && paperNumber !== "" && sitsAt !== "";

  return (
    <RecordDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Add a paper"
      description="One row of the board's timetable. Seating and the invigilation list hang off the date."
      size="sm"
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
          <Button
            type="button"
            disabled={!ready || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? "Adding…" : "Add the paper"}
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        {error ? (
          <p className="rounded-md bg-[color:var(--tone-danger-surface)] px-3 py-2 text-sm text-[color:var(--tone-danger)]">
            {error}
          </p>
        ) : null}

        <div className="space-y-1.5">
          <Label htmlFor="paper-subject">Subject</Label>
          <Select value={examSubjectId} onValueChange={setExamSubjectId}>
            <SelectTrigger id="paper-subject">
              <SelectValue
                placeholder={
                  referenceQuery.isPending || seriesQuery.isPending
                    ? "Loading…"
                    : subjects.length === 0
                      ? "No subjects for this board and level"
                      : "Pick a subject"
                }
              />
            </SelectTrigger>
            <SelectContent>
              {subjects.map((subject) => (
                <SelectItem key={subject.id} value={subject.id}>
                  {subject.name} · {subject.code}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!referenceQuery.isPending && subjects.length === 0 ? (
            <p className="text-xs text-[color:var(--text-muted)]">
              This series&apos; board and level have no subjects recorded yet. Add them under
              the exam reference first.
            </p>
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="paper-number">Paper</Label>
            <Input
              id="paper-number"
              type="number"
              min={1}
              max={20}
              value={paperNumber}
              onChange={(event) => setPaperNumber(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="paper-code">Code</Label>
            <Input
              id="paper-code"
              value={code}
              placeholder={suggestedCode || "4008/1"}
              onChange={(event) => setCode(event.target.value)}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="paper-sits-at">Sits at</Label>
          <Input
            id="paper-sits-at"
            type="datetime-local"
            value={sitsAt}
            onChange={(event) => setSitsAt(event.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="paper-hours">Length</Label>
          <div className="flex items-center gap-2">
            <Input
              id="paper-hours"
              type="number"
              min={0}
              max={9}
              className="w-[70px]"
              value={hours}
              placeholder="2"
              onChange={(event) => setHours(event.target.value)}
            />
            <span className="text-sm text-[color:var(--text-muted)]">h</span>
            <Input
              id="paper-minutes"
              type="number"
              min={0}
              max={59}
              className="w-[70px]"
              value={minutes}
              placeholder="30"
              onChange={(event) => setMinutes(event.target.value)}
            />
            <span className="text-sm text-[color:var(--text-muted)]">min</span>
          </div>
          <p className="text-xs text-[color:var(--text-muted)]">
            Optional. It sets when the sitting ends, which is what the clash check reads.
          </p>
        </div>
      </div>
    </RecordDialog>
  );
}
