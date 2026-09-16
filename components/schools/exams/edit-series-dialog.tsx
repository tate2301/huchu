"use client";

import { useState } from "react";
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
  EXAM_LEVEL_LABELS,
  SERIES_STATUS_LABELS,
  fetchExamReference,
  fetchSeries,
  updateSeries,
  type ExamLevel,
  type SeriesStatus,
} from "@/lib/schools/exams-v2";

/**
 * `Correct the series` — the board moved the date, or somebody typed it wrong.
 *
 * `New series` was the only place these facts were ever asked for, so the first
 * filling-in was the last. The deadline is the reason this dialog exists: it is
 * what the alert, the countdown bar and the red `Entries close` column on the
 * page behind all read, and a school that put 3 September where it meant
 * 3 August was being counted down to the wrong morning with no way to correct
 * it. The fees are the second reason — boards publish them late and revise
 * them, and every unentered subject is priced off this row.
 *
 * Board and level go read-only the moment anybody is on the roll. An entry is
 * written against the board's syllabus codes at this level, so moving either
 * underneath a registered candidate would orphan the lot. The line under them
 * says so with the count rather than waiting for the API to refuse.
 *
 * `Standing` is here because nothing else in the product ever moved it: a
 * series stayed `Planned` through its own results. It goes forwards freely; the
 * API refuses the way back once results are captured.
 */
export function EditSeriesDialog({
  seriesId,
  onOpenChange,
  onSaved,
  onError,
}: {
  /** Null closes it; the series being corrected is the dialog's identity. */
  seriesId: string | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  /** Lifted to the page too: a dialog that closes takes its own error with it. */
  onError?: (message: string) => void;
}) {
  const open = seriesId !== null;

  const detail = useQuery({
    queryKey: ["schools", "exams", "series", seriesId],
    queryFn: () => fetchSeries(seriesId!),
    enabled: open,
  });

  const reference = useQuery({
    queryKey: ["schools", "exams", "reference"],
    queryFn: fetchExamReference,
    enabled: open,
  });

  const [boardId, setBoardId] = useState("");
  const [centreId, setCentreId] = useState("");
  const [name, setName] = useState("");
  const [year, setYear] = useState("");
  const [level, setLevel] = useState<ExamLevel>("O_LEVEL");
  const [status, setStatus] = useState<SeriesStatus>("PLANNED");
  const [cohortLevel, setCohortLevel] = useState("");
  const [entriesOpenAt, setEntriesOpenAt] = useState("");
  const [entriesCloseAt, setEntriesCloseAt] = useState("");
  const [lateEntriesCloseAt, setLateEntriesCloseAt] = useState("");
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [resultsDueOn, setResultsDueOn] = useState("");
  const [feePerSubject, setFeePerSubject] = useState("");
  const [lateFeePerSubject, setLateFeePerSubject] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Seed from the row as it stands, once per series. A dialog that re-seeded on
  // every render would overwrite what the reader is in the middle of typing.
  const [seededFor, setSeededFor] = useState<string | null>(null);
  const loaded = detail.data;
  if (loaded && seededFor !== loaded.series.id) {
    const series = loaded.series;
    setSeededFor(series.id);
    setBoardId(series.board.id);
    setCentreId(series.centre?.id ?? "");
    setName(series.name);
    setYear(String(series.year));
    setLevel(series.level);
    setStatus(series.status as SeriesStatus);
    setCohortLevel(series.cohortLevel != null ? String(series.cohortLevel) : "");
    setEntriesOpenAt(toDateInput(series.entriesOpenAt));
    setEntriesCloseAt(toDateInput(series.entriesCloseAt));
    setLateEntriesCloseAt(toDateInput(series.lateEntriesCloseAt));
    setStartsOn(toDateInput(series.startsOn));
    setEndsOn(toDateInput(series.endsOn));
    setResultsDueOn(toDateInput(series.resultsDueOn));
    setFeePerSubject(series.feePerSubject ?? "");
    setLateFeePerSubject(series.lateFeePerSubject ?? "");
    setError(null);
  }
  if (!open && seededFor !== null) setSeededFor(null);

  const centres = (reference.data?.centres ?? []).filter(
    (centre) => !boardId || centre.boardId === boardId,
  );

  // What the API will refuse, said before the reader tries it.
  const candidates = loaded?.tallies.candidates ?? 0;
  const rollIsSet = candidates > 0;

  const save = useMutation({
    mutationFn: () =>
      updateSeries(seriesId!, {
        // Board and level only move while the roll is empty, so they are not
        // even sent once it is not.
        ...(rollIsSet ? {} : { boardId, level }),
        centreId: centreId || null,
        name: name.trim(),
        year: Number(year),
        status,
        cohortLevel: cohortLevel ? Number(cohortLevel) : null,
        // An empty box is a cleared date, not an unmentioned one — a board that
        // drops its late window is exactly what this has to be able to say.
        entriesOpenAt: fromDateInput(entriesOpenAt),
        entriesCloseAt: fromDateInput(entriesCloseAt),
        lateEntriesCloseAt: fromDateInput(lateEntriesCloseAt),
        startsOn: fromDateInput(startsOn),
        endsOn: fromDateInput(endsOn),
        resultsDueOn: fromDateInput(resultsDueOn),
        feePerSubject: feePerSubject === "" ? null : Number(feePerSubject),
        lateFeePerSubject: lateFeePerSubject === "" ? null : Number(lateFeePerSubject),
      }),
    onSuccess: () => {
      setError(null);
      onSaved();
      onOpenChange(false);
    },
    onError: (cause) => {
      const message = getApiErrorMessage(cause);
      setError(message);
      onError?.(message);
    },
  });

  const canSubmit =
    Boolean(loaded) && boardId.length > 0 && name.trim().length > 0 && year.length === 4;

  return (
    <RecordDialog
      open={open}
      onOpenChange={onOpenChange}
      title={loaded ? `Correct ${loaded.series.board.name} ${loaded.series.name}` : "Correct the series"}
      description="The dates every countdown on these screens reads, and the fees each entry is priced off."
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
            {save.isPending ? "Saving…" : "Save the corrections"}
          </Button>
        </div>
      }
    >
      {detail.isPending ? (
        <p className="text-sm text-[color:var(--text-muted)]">Reading the series…</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="edit-series-board">Board</Label>
            <Select
              value={boardId}
              disabled={rollIsSet}
              onValueChange={(next) => {
                setBoardId(next);
                setCentreId("");
              }}
            >
              <SelectTrigger id="edit-series-board">
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
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-series-level">Level</Label>
            <Select
              value={level}
              disabled={rollIsSet}
              onValueChange={(next) => setLevel(next as ExamLevel)}
            >
              <SelectTrigger id="edit-series-level">
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

          {rollIsSet ? (
            <p className="text-xs text-[color:var(--tone-warn)] sm:col-span-2">
              {candidates} candidate{candidates === 1 ? " is" : "s are"} already on this roll, so
              the board and the level are fixed. Their entries carry this board&rsquo;s syllabus
              codes at this level — a series under another board is a new series.
            </p>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="edit-series-centre">Centre number</Label>
            <Select value={centreId} onValueChange={setCentreId}>
              <SelectTrigger id="edit-series-centre">
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
            <Label htmlFor="edit-series-status">Standing</Label>
            <Select value={status} onValueChange={(next) => setStatus(next as SeriesStatus)}>
              <SelectTrigger id="edit-series-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(SERIES_STATUS_LABELS) as SeriesStatus[]).map((option) => (
                  <SelectItem key={option} value={option}>
                    {SERIES_STATUS_LABELS[option]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-[color:var(--text-muted)]">
              What the badge on the index says. It moves on freely; going back is refused once
              results are captured.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-series-name">Series</Label>
            <Input
              id="edit-series-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="November 2026"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-series-year">Year</Label>
            <Input
              id="edit-series-year"
              type="number"
              min={2000}
              max={2100}
              value={year}
              onChange={(event) => setYear(event.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-series-cohort">Year group that sits it</Label>
            <Input
              id="edit-series-cohort"
              type="number"
              min={1}
              max={13}
              value={cohortLevel}
              onChange={(event) => setCohortLevel(event.target.value)}
              placeholder="4"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-series-open">Entries open</Label>
            <Input
              id="edit-series-open"
              type="date"
              value={entriesOpenAt}
              onChange={(event) => setEntriesOpenAt(event.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-series-close">Entries close</Label>
            <Input
              id="edit-series-close"
              type="date"
              value={entriesCloseAt}
              onChange={(event) => setEntriesCloseAt(event.target.value)}
            />
            <p className="text-xs text-[color:var(--text-muted)]">
              The date that can cost a pupil a year. Everything else on these screens counts down
              to it, so this is the one worth checking against the board&rsquo;s circular.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-series-late">Late entries close</Label>
            <Input
              id="edit-series-late"
              type="date"
              value={lateEntriesCloseAt}
              onChange={(event) => setLateEntriesCloseAt(event.target.value)}
            />
            <p className="text-xs text-[color:var(--text-muted)]">
              Empty it if the board withdrew the late window.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-series-starts">Papers start</Label>
            <Input
              id="edit-series-starts"
              type="date"
              value={startsOn}
              onChange={(event) => setStartsOn(event.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-series-ends">Papers end</Label>
            <Input
              id="edit-series-ends"
              type="date"
              value={endsOn}
              onChange={(event) => setEndsOn(event.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-series-results">Results due</Label>
            <Input
              id="edit-series-results"
              type="date"
              value={resultsDueOn}
              onChange={(event) => setResultsDueOn(event.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-series-fee">Fee a subject</Label>
            <Input
              id="edit-series-fee"
              type="number"
              min={0}
              step="0.01"
              value={feePerSubject}
              onChange={(event) => setFeePerSubject(event.target.value)}
              placeholder="28.00"
            />
            <p className="text-xs text-[color:var(--text-muted)]">
              Subjects already invoiced keep the price they were invoiced at. This is what the
              next entry costs.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-series-late-fee">Late fee a subject</Label>
            <Input
              id="edit-series-late-fee"
              type="number"
              min={0}
              step="0.01"
              value={lateFeePerSubject}
              onChange={(event) => setLateFeePerSubject(event.target.value)}
              placeholder="14.00"
            />
          </div>
        </div>
      )}
    </RecordDialog>
  );
}

/**
 * The `date` input wants `YYYY-MM-DD`, and these are stored as instants at UTC
 * midnight — so the UTC calendar day is the one that round-trips. Reading it in
 * the browser's zone would shift a deadline by a day for anybody west of
 * Greenwich, which is the one error these dates cannot afford.
 */
function toDateInput(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

/** An empty box is an explicit `null` — the school clearing the date. */
function fromDateInput(value: string): string | null {
  return value ? new Date(value).toISOString() : null;
}
