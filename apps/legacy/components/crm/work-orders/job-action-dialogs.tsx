"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { Button } from "@corelithzw/ui/components/button";
import { Checkbox } from "@corelithzw/ui/components/checkbox";
import { Input } from "@corelithzw/ui/components/input";
import { Label } from "@corelithzw/ui/components/label";
import { Textarea } from "@corelithzw/ui/components/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@corelithzw/ui/components/select";
import { RecordDialog } from "@/components/crm/records/record-dialog";
import { fetchJson } from "@corelithzw/platform/api-client";
import { completionBlockers } from "@/lib/crm/work-orders";

import type { JobRecord } from "./job-types";
import type { CompleteInput, JobRefusal, ScheduleInput } from "./use-job-actions";

type TeamResponse = { data: Array<{ id: string; name: string | null; email: string }> };

/** A `datetime-local` value for an instant, in the reader's own clock. */
function toLocalInput(value: string | null): string {
  const at = value ? new Date(value) : null;
  const base = at && !Number.isNaN(at.getTime()) ? at : nextMorning();
  const offset = base.getTimezoneOffset() * 60_000;
  return new Date(base.getTime() - offset).toISOString().slice(0, 16);
}

/** Tomorrow at eight, which is when a job realistically starts. */
function nextMorning(): Date {
  const day = new Date();
  day.setDate(day.getDate() + 1);
  day.setHours(8, 0, 0, 0);
  return day;
}

/**
 * Book the job in.
 *
 * The same form whether the job has never had a slot or is being moved from
 * Tuesday to Thursday — the route treats a reschedule as a schedule, because
 * moving a booking is the commonest thing that happens to a diary, and two
 * dialogs for one action would be two places to get the timezone wrong.
 */
export function JobScheduleDialog({
  job,
  open,
  onOpenChange,
  onSubmit,
  isPending,
  refusal,
}: {
  job: JobRecord;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: ScheduleInput) => void;
  isPending: boolean;
  refusal: JobRefusal | null;
}) {
  const [start, setStart] = useState(() => toLocalInput(job.scheduledStart));
  const [end, setEnd] = useState(() => (job.scheduledEnd ? toLocalInput(job.scheduledEnd) : ""));
  const [assignedToId, setAssignedToId] = useState(job.assignedTo?.id ?? "");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setStart(toLocalInput(job.scheduledStart));
      setEnd(job.scheduledEnd ? toLocalInput(job.scheduledEnd) : "");
      setAssignedToId(job.assignedTo?.id ?? "");
      setNote("");
      setError(null);
    }
  }

  const { data: team } = useQuery({
    queryKey: ["crm", "team"],
    queryFn: () => fetchJson<TeamResponse>("/api/v2/crm/team"),
    staleTime: 5 * 60_000,
    enabled: open,
  });

  return (
    <RecordDialog
      open={open}
      onOpenChange={onOpenChange}
      title={job.scheduledStart ? "Move the booking" : "Book the job in"}
      description="A slot, and somebody to turn up."
      errors={[error, refusal?.message].filter((entry): entry is string => Boolean(entry))}
      onSubmit={(event) => {
        event.preventDefault();
        if (!start) {
          setError("A job with no slot is still a plan — give it a start.");
          return;
        }
        setError(null);
        onSubmit({
          scheduledStart: new Date(start).toISOString(),
          scheduledEnd: end ? new Date(end).toISOString() : null,
          assignedToId: assignedToId || null,
          note: note.trim() || null,
        });
      }}
      footer={
        <>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={isPending}>
            {isPending ? "Booking…" : "Book it in"}
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="job-schedule-start">Starts *</Label>
          <Input
            id="job-schedule-start"
            type="datetime-local"
            value={start}
            onChange={(event) => setStart(event.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="job-schedule-end">Expected to finish</Label>
          <Input
            id="job-schedule-end"
            type="datetime-local"
            value={end}
            onChange={(event) => setEnd(event.target.value)}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Crew lead</Label>
        <Select value={assignedToId} onValueChange={setAssignedToId}>
          <SelectTrigger>
            <SelectValue placeholder="Unassigned" />
          </SelectTrigger>
          <SelectContent>
            {(team?.data ?? []).map((user) => (
              <SelectItem key={user.id} value={user.id}>
                {user.name ?? user.email}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="job-schedule-note">Anything the crew should know</Label>
        <Textarea
          id="job-schedule-note"
          rows={2}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Moved because the parts land on Wednesday…"
        />
      </div>
    </RecordDialog>
  );
}

/**
 * Why the job has stalled.
 *
 * The reason is the whole point — "blocked" on its own tells a coordinator
 * nothing they can act on — so the button stays off until there is one.
 */
export function JobBlockDialog({
  job,
  open,
  onOpenChange,
  onSubmit,
  isPending,
  refusal,
}: {
  job: JobRecord;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (reason: string) => void;
  isPending: boolean;
  refusal: JobRefusal | null;
}) {
  const [reason, setReason] = useState(job.blockedReason ?? "");

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setReason(job.blockedReason ?? "");
  }

  return (
    <RecordDialog
      open={open}
      onOpenChange={onOpenChange}
      title="What has stopped it?"
      description="Whoever picks this up next reads exactly this."
      size="md"
      errors={refusal?.message ? [refusal.message] : undefined}
      onSubmit={(event) => {
        event.preventDefault();
        if (reason.trim()) onSubmit(reason.trim());
      }}
      footer={
        <>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={isPending || !reason.trim()}>
            {isPending ? "Saving…" : "Mark it blocked"}
          </Button>
        </>
      }
    >
      <div className="space-y-1.5">
        <Label htmlFor="job-block-reason">Reason *</Label>
        <Textarea
          id="job-block-reason"
          rows={3}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Meter cupboard locked, caretaker away until Thursday"
        />
      </div>
    </RecordDialog>
  );
}

/**
 * The job isn't happening.
 *
 * Off the stage rail on purpose — cancelling is leaving the path, not a step
 * along it — and asked for in the same shape as blocking, because the two
 * questions a register has to answer about a job nobody is working on are the
 * same question: why.
 */
export function JobCancelDialog({
  job,
  open,
  onOpenChange,
  onSubmit,
  isPending,
  refusal,
}: {
  job: JobRecord;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (reason: string) => void;
  isPending: boolean;
  refusal: JobRefusal | null;
}) {
  const [reason, setReason] = useState("");

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setReason("");
  }

  return (
    <RecordDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Cancel ${job.workOrderNo}?`}
      description="It stays in the register as cancelled — nothing is deleted — and stops counting as work anybody has to do."
      size="md"
      errors={refusal?.message ? [refusal.message] : undefined}
      onSubmit={(event) => {
        event.preventDefault();
        if (reason.trim()) onSubmit(reason.trim());
      }}
      footer={
        <>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Keep the job
          </Button>
          <Button type="submit" variant="destructive" disabled={isPending || !reason.trim()}>
            {isPending ? "Cancelling…" : "Cancel the job"}
          </Button>
        </>
      }
    >
      <div className="space-y-1.5">
        <Label htmlFor="job-cancel-reason">Why *</Label>
        <Textarea
          id="job-cancel-reason"
          rows={3}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Raised against the wrong site — the real one is WO-0114"
        />
        <p className="text-sm text-[var(--text-muted)]">
          A cancelled job cannot be reopened. If the work is only postponed, book it in
          again instead.
        </p>
      </div>
    </RecordDialog>
  );
}

/**
 * Sign the job off.
 *
 * A job with nobody's name against it is a job the customer can still say
 * never happened, so the name is what the button waits for — and whatever the
 * checklist still has outstanding is named here rather than discovered as a
 * 409 after pressing. Any remaining quantities are carried in the same
 * request: on site the last item gets ticked and the customer signs in the
 * same minute.
 */
export function JobCompleteDialog({
  job,
  open,
  onOpenChange,
  onSubmit,
  isPending,
  refusal,
}: {
  job: JobRecord;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: CompleteInput) => void;
  isPending: boolean;
  refusal: JobRefusal | null;
}) {
  // A client who already signed through `/s/<token>` has said the work is
  // done, and the server counts their word as the signature — so the form
  // opens with their name in it rather than blank, which is what made a job
  // the customer had already signed look unsignable.
  const signature = job.signedByName ?? job.signOffName ?? "";
  const [signedByName, setSignedByName] = useState(signature);
  const [notes, setNotes] = useState(job.completionNotes ?? "");
  const [rating, setRating] = useState<string>(
    job.customerRating ? String(job.customerRating) : "",
  );
  const [finishAll, setFinishAll] = useState(false);

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setSignedByName(signature);
      setNotes(job.completionNotes ?? "");
      setRating(job.customerRating ? String(job.customerRating) : "");
      setFinishAll(false);
    }
  }

  const unfinished = job.items.filter((item) => item.completedQuantity < item.quantity);
  // The server's own test, run against what this form is about to send rather
  // than against what the job is now. Calling `completionBlockers` instead of
  // rewriting its two rules here is what stops the button being enabled
  // against a 409, or disabled against a job the server would happily close.
  const outstanding = completionBlockers({
    items: job.items.map((item) => ({
      quantity: item.quantity,
      completedQuantity: finishAll ? item.quantity : item.completedQuantity,
    })),
    signedByName: signedByName.trim(),
  });

  return (
    <RecordDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Sign off and complete"
      description="What was done, and who accepted it."
      errors={
        refusal?.blockers?.length
          ? refusal.blockers
          : refusal?.message
            ? [refusal.message]
            : undefined
      }
      onSubmit={(event) => {
        event.preventDefault();
        if (outstanding.length > 0) return;
        onSubmit({
          signedByName: signedByName.trim(),
          completionNotes: notes.trim() || null,
          customerRating: rating ? Number(rating) : null,
          itemProgress: finishAll
            ? unfinished.map((item) => ({ id: item.id, completedQuantity: item.quantity }))
            : undefined,
        });
      }}
      footer={
        <>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {/* Disabled with the reason spelled out beside it, not a button that
              looks pressable and answers with a 409. */}
          <Button
            type="submit"
            disabled={isPending || outstanding.length > 0}
            title={outstanding.length > 0 ? outstanding.join(". ") : undefined}
          >
            {isPending ? "Closing…" : "Complete the job"}
          </Button>
        </>
      }
    >
      <div className="space-y-1.5">
        <Label htmlFor="job-signed-by">Signed off by *</Label>
        <Input
          id="job-signed-by"
          value={signedByName}
          onChange={(event) => setSignedByName(event.target.value)}
          placeholder="Who at the site accepted the work"
        />
        <p className="text-sm text-[var(--text-muted)]">
          The customer&apos;s name, not yours. This is what stands against the work.
        </p>
      </div>

      {unfinished.length > 0 ? (
        <label className="flex cursor-pointer items-start gap-2 rounded-[var(--radius-md)] border border-[var(--status-warning-border)] bg-[var(--badge-warn-bg)] px-2.5 py-2 text-sm text-[var(--badge-warn-fg)]">
          <Checkbox
            className="mt-0.5"
            checked={finishAll}
            onCheckedChange={(value) => setFinishAll(value === true)}
          />
          <span>
            {unfinished.length} item{unfinished.length === 1 ? " is" : "s are"} not fully done.
            Tick to record {unfinished.length === 1 ? "it" : "them"} as finished.
          </span>
        </label>
      ) : null}

      <div className="space-y-1.5">
        <Label htmlFor="job-completion-notes">Notes</Label>
        <Textarea
          id="job-completion-notes"
          rows={2}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Two extra brackets used, customer happy to be billed for them"
        />
      </div>

      <div className="space-y-1.5">
        <Label>How did it go, in their words</Label>
        <Select value={rating} onValueChange={setRating}>
          <SelectTrigger>
            <SelectValue placeholder="Not asked" />
          </SelectTrigger>
          <SelectContent>
            {[5, 4, 3, 2, 1].map((score) => (
              <SelectItem key={score} value={String(score)}>
                {score} out of 5
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </RecordDialog>
  );
}
