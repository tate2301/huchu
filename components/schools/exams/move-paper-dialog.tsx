"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";

import { RecordDialog } from "@/components/crm/records/record-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getApiErrorMessage } from "@/lib/api-client";
import { reschedulePaper, type TimetablePaper } from "@/lib/schools/exams-v2";

/**
 * `Move it` — the board changed the date.
 *
 * Without this a paper with the wrong date could only be taken off the
 * timetable and added again, and taking one off is refused once anybody is
 * seated for it. So a seated paper that moved was uncorrectable: the hall would
 * have been laid out for a morning the board had already abandoned.
 *
 * The sitting moves with the paper. They are one fact stored twice, and
 * `reschedulePaper` writes both in a transaction for that reason.
 */
export function MovePaperDialog({
  seriesId,
  paper,
  onOpenChange,
  onMoved,
}: {
  seriesId: string;
  /** Null closes the dialog; the paper being moved is its identity. */
  paper: TimetablePaper | null;
  onOpenChange: (open: boolean) => void;
  onMoved: () => void;
}) {
  const [sitsAt, setSitsAt] = useState(() => toLocalInput(paper?.sitsAt ?? null));
  const [hours, setHours] = useState(() =>
    paper?.durationMinutes ? String(Math.floor(paper.durationMinutes / 60)) : "",
  );
  const [minutes, setMinutes] = useState(() =>
    paper?.durationMinutes ? String(paper.durationMinutes % 60) : "",
  );
  const [error, setError] = useState<string | null>(null);

  const durationMinutes = (() => {
    const total = Number(hours || 0) * 60 + Number(minutes || 0);
    return total > 0 ? total : null;
  })();

  const save = useMutation({
    mutationFn: () =>
      reschedulePaper(seriesId, {
        paperId: paper!.id,
        sitsAt: new Date(sitsAt).toISOString(),
        durationMinutes,
      }),
    onSuccess: () => {
      setError(null);
      onMoved();
      onOpenChange(false);
    },
    onError: (cause) => setError(getApiErrorMessage(cause)),
  });

  const seated = paper?.session?.seated ?? 0;

  return (
    <RecordDialog
      open={paper !== null}
      onOpenChange={onOpenChange}
      title={paper ? `Move ${paper.code}` : "Move the paper"}
      description="The sitting moves with it, so the seating stays attached to the right morning."
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
            disabled={sitsAt === "" || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? "Moving…" : "Move it"}
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
          <Label htmlFor="move-sits-at">Sits at</Label>
          <Input
            id="move-sits-at"
            type="datetime-local"
            value={sitsAt}
            onChange={(event) => setSitsAt(event.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="move-hours">Length</Label>
          <div className="flex items-center gap-2">
            <Input
              id="move-hours"
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
              id="move-minutes"
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
        </div>

        {seated > 0 ? (
          // Said before the move, not discovered after it. The desk cards carry
          // the old morning.
          <p className="text-xs text-[color:var(--tone-warn)]">
            {seated} candidate{seated === 1 ? " is" : "s are"} already seated for this paper.
            They keep their seats, but anybody holding a printed desk card or seating list
            will be holding the wrong date — reprint them.
          </p>
        ) : null}
      </div>
    </RecordDialog>
  );
}

/** A `datetime-local` value for an ISO string, in the reader's own zone. */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
