"use client";

import { useState } from "react";
import Link from "next/link";
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
import { CohortLevelSelect } from "@/components/schools/exams/cohort-level-select";
import {
  EXAM_LEVEL_LABELS,
  createSeries,
  fetchExamReference,
  type ExamLevel,
} from "@/lib/schools/exams-v2";

/**
 * `New series`.
 *
 * Board, level, centre number and the date entries close — and the last of
 * those is the one the rest of the module hangs off, which is why it is asked
 * for here rather than left to be filled in later. A series with no deadline
 * draws no chip, no alert and no days-away bar, which is a screen that has lost
 * its argument.
 *
 * The centre number list is filtered by board, because a centre number belongs
 * to one board: `025419` is the school to ZIMSEC and means nothing to
 * Cambridge, which knows the same school as `ZW254`.
 */
export function NewSeriesDialog({
  open,
  onOpenChange,
  onSaved,
  onError,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  /** Lifted to the page too: a dialog that closes takes its own error with it. */
  onError?: (message: string) => void;
}) {
  const [boardId, setBoardId] = useState("");
  const [centreId, setCentreId] = useState("");
  const [name, setName] = useState("");
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [level, setLevel] = useState<ExamLevel>("O_LEVEL");
  const [cohortLevel, setCohortLevel] = useState("");
  const [entriesCloseAt, setEntriesCloseAt] = useState("");
  const [lateEntriesCloseAt, setLateEntriesCloseAt] = useState("");
  const [feePerSubject, setFeePerSubject] = useState("");
  const [lateFeePerSubject, setLateFeePerSubject] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setBoardId("");
      setCentreId("");
      setName("");
      setYear(String(new Date().getFullYear()));
      setLevel("O_LEVEL");
      setCohortLevel("");
      setEntriesCloseAt("");
      setLateEntriesCloseAt("");
      setFeePerSubject("");
      setLateFeePerSubject("");
      setError(null);
    }
  }

  const reference = useQuery({
    queryKey: ["schools", "exams", "reference"],
    queryFn: fetchExamReference,
    enabled: open,
  });

  const centres = (reference.data?.centres ?? []).filter(
    (centre) => !boardId || centre.boardId === boardId,
  );

  const save = useMutation({
    mutationFn: () =>
      createSeries({
        boardId,
        centreId: centreId || null,
        name: name.trim(),
        year: Number(year),
        level,
        cohortLevel: cohortLevel ? Number(cohortLevel) : null,
        entriesCloseAt: entriesCloseAt ? new Date(entriesCloseAt).toISOString() : null,
        lateEntriesCloseAt: lateEntriesCloseAt
          ? new Date(lateEntriesCloseAt).toISOString()
          : null,
        feePerSubject: feePerSubject ? Number(feePerSubject) : null,
        lateFeePerSubject: lateFeePerSubject ? Number(lateFeePerSubject) : null,
      }),
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

  const canSubmit = boardId.length > 0 && name.trim().length > 0 && year.length === 4;

  return (
    <RecordDialog
      open={open}
      onOpenChange={onOpenChange}
      title="New exam series"
      description="A board, a level, a centre number and the date entries close."
      size="md"
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
            {save.isPending ? "Saving…" : "Create the series"}
          </Button>
        </div>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="series-board">Board</Label>
          <Select
            value={boardId}
            onValueChange={(next) => {
              setBoardId(next);
              setCentreId("");
            }}
          >
            <SelectTrigger id="series-board">
              <SelectValue placeholder="Pick a board" />
            </SelectTrigger>
            <SelectContent>
              {(reference.data?.boards ?? []).map((board) => (
                <SelectItem key={board.id} value={board.id}>
                  {board.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {(reference.data?.boards ?? []).length === 0 && !reference.isPending ? (
            // It explained the ordering and then left the reader with nowhere
            // to go — there was no screen that created a board at all. Now
            // there is, so say where.
            <p className="text-xs text-[color:var(--text-muted)]">
              No board has been set up yet. A board and its centre number come first — the board
              issues the number and it is stable across years.{" "}
              <Link
                href="/schools/exams/reference"
                className="underline underline-offset-2 hover:text-[color:var(--text-body)]"
              >
                Set one up
              </Link>
              .
            </p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="series-centre">Centre number</Label>
          <Select value={centreId} onValueChange={setCentreId}>
            <SelectTrigger id="series-centre">
              <SelectValue placeholder="Pick a centre" />
            </SelectTrigger>
            <SelectContent>
              {centres.map((centre) => (
                <SelectItem key={centre.id} value={centre.id}>
                  {centre.number}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="series-name">Series</Label>
          <Input
            id="series-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="November 2026"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="series-year">Year</Label>
          <Input
            id="series-year"
            type="number"
            min={2000}
            max={2100}
            value={year}
            onChange={(event) => setYear(event.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="series-level">Level</Label>
          <Select value={level} onValueChange={(next) => setLevel(next as ExamLevel)}>
            <SelectTrigger id="series-level">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(EXAM_LEVEL_LABELS) as ExamLevel[]).map((option) => (
                <SelectItem key={option} value={option}>
                  {EXAM_LEVEL_LABELS[option]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="series-cohort">Who sits it</Label>
          <CohortLevelSelect id="series-cohort" value={cohortLevel} onChange={setCohortLevel} />
          <p className="text-xs text-[color:var(--text-muted)]">
            The class whose pupils become candidates. It is what &ldquo;Register the
            cohort&rdquo; reads.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="series-close">Entries close</Label>
          <Input
            id="series-close"
            type="date"
            value={entriesCloseAt}
            onChange={(event) => setEntriesCloseAt(event.target.value)}
          />
          <p className="text-xs text-[color:var(--text-muted)]">
            The date that can cost a pupil a year. Everything else on these screens counts down
            to it.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="series-late">Late entries close</Label>
          <Input
            id="series-late"
            type="date"
            value={lateEntriesCloseAt}
            onChange={(event) => setLateEntriesCloseAt(event.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="series-fee">Fee a subject</Label>
          <Input
            id="series-fee"
            type="number"
            min={0}
            step="0.01"
            value={feePerSubject}
            onChange={(event) => setFeePerSubject(event.target.value)}
            placeholder="28.00"
          />
          <p className="text-xs text-[color:var(--text-muted)]">
            Charged per subject entered. Ten subjects is ten fees.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="series-late-fee">Late fee a subject</Label>
          <Input
            id="series-late-fee"
            type="number"
            min={0}
            step="0.01"
            value={lateFeePerSubject}
            onChange={(event) => setLateFeePerSubject(event.target.value)}
            placeholder="14.00"
          />
        </div>
      </div>
    </RecordDialog>
  );
}
