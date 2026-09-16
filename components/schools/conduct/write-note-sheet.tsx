"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

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
import { Textarea } from "@/components/ui/textarea";
import { fetchStudentRoll } from "@/lib/schools/students-v2";
import {
  PASTORAL_BAND_LABELS,
  type PastoralBand,
  type ReaderRow,
} from "@/lib/schools/conduct-v2";

/**
 * `Write a note`.
 *
 * **The band is chosen when the note is written**, not afterwards. There is no
 * "change visibility" verb on a written note anywhere in this module: widening
 * one is a decision about a child that needs a reason and a record, not a
 * dropdown on a row.
 *
 * A safeguarding note must name its readers in the same act. The form says so
 * before the save rather than after it, because a note under that band with
 * nobody named on it is readable by nobody at all — including its author on
 * their next session, which looks like a bug and is worse than one.
 */
export function WriteNoteSheet({
  open,
  onOpenChange,
  readers,
  isSaving,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Who could be named on a safeguarding note. */
  readers: ReaderRow[];
  isSaving: boolean;
  onSubmit: (values: {
    studentId: string;
    body: string;
    band: PastoralBand;
    reviewDueAt?: string | null;
    referredTo?: string | null;
    namedReaderIds?: string[];
  }) => void;
}) {
  const [studentId, setStudentId] = useState("");
  const [pupilSearch, setPupilSearch] = useState("");
  const [body, setBody] = useState("");
  const [band, setBand] = useState<PastoralBand>("PASTORAL_TEAM_ONLY");
  const [reviewDueAt, setReviewDueAt] = useState("");
  const [referredTo, setReferredTo] = useState("");
  const [named, setNamed] = useState<string[]>([]);

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setStudentId("");
      setPupilSearch("");
      setBody("");
      setBand("PASTORAL_TEAM_ONLY");
      setReviewDueAt("");
      setReferredTo("");
      setNamed([]);
    }
  }

  const rollQuery = useQuery({
    queryKey: ["schools", "students", "picker", pupilSearch],
    queryFn: () =>
      fetchStudentRoll({ limit: 25, search: pupilSearch || undefined, status: "ACTIVE" }),
    enabled: open,
  });

  const safeguarding = band === "SAFEGUARDING_NAMED_INDIVIDUALS";
  const canSubmit =
    studentId.length > 0 && body.trim().length > 0 && (!safeguarding || named.length > 0);

  return (
    <RecordDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Write a pastoral note"
      description="Who may read it is decided now, with the note. It cannot be widened afterwards."
      size="lg"
      onSubmit={(event) => {
        event.preventDefault();
        if (!canSubmit || isSaving) return;
        onSubmit({
          studentId,
          body: body.trim(),
          band,
          reviewDueAt: reviewDueAt ? new Date(reviewDueAt).toISOString() : null,
          referredTo: referredTo.trim() || null,
          namedReaderIds: safeguarding ? named : undefined,
        });
      }}
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={!canSubmit || isSaving}>
            {isSaving ? "Saving…" : "Write it"}
          </Button>
        </div>
      }
    >
      <SavingOverlay saving={isSaving} label="Writing the note">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="note-pupil-search">Pupil</Label>
            <Input
              id="note-pupil-search"
              value={pupilSearch}
              onChange={(event) => setPupilSearch(event.target.value)}
              placeholder="Search name or number"
            />
            <Select value={studentId} onValueChange={setStudentId}>
              <SelectTrigger id="note-pupil">
                <SelectValue
                  placeholder={rollQuery.isPending ? "Reading the roll…" : "Pick a pupil"}
                />
              </SelectTrigger>
              <SelectContent>
                {(rollQuery.data?.data ?? []).map((pupil) => (
                  <SelectItem key={pupil.id} value={pupil.id}>
                    {pupil.lastName}, {pupil.firstName} · {pupil.studentNo}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="note-body">The note</Label>
            <Textarea
              id="note-body"
              value={body}
              rows={6}
              maxLength={8000}
              onChange={(event) => setBody(event.target.value)}
              placeholder="His father's job ended in July. The lateness started the week the fees letter went home."
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="note-band">Who may read it</Label>
            <Select value={band} onValueChange={(next) => setBand(next as PastoralBand)}>
              <SelectTrigger id="note-band">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(PASTORAL_BAND_LABELS) as PastoralBand[]).map((option) => (
                  <SelectItem key={option} value={option}>
                    {PASTORAL_BAND_LABELS[option]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-[color:var(--text-muted)]">
              {safeguarding
                ? "Only the people named below will be able to open this. No role and no seniority reaches it."
                : "Anybody cleared for this band, within the pupils they are cleared for."}
            </p>
          </div>

          {safeguarding ? (
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Named on the note</legend>
              <div className="space-y-1">
                {readers
                  .filter((reader) => !reader.isYou)
                  .map((reader) => (
                    <label key={reader.userId} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={named.includes(reader.userId)}
                        onChange={(event) =>
                          setNamed((current) =>
                            event.target.checked
                              ? [...current, reader.userId]
                              : current.filter((id) => id !== reader.userId),
                          )
                        }
                      />
                      {reader.name}
                      <span className="text-xs text-[color:var(--text-muted)]">
                        {reader.role ?? "Staff"}
                      </span>
                    </label>
                  ))}
              </div>
              <p className="text-xs text-[color:var(--text-muted)]">
                You are named automatically. Name at least one other person, or nobody but you
                will ever be able to open it.
              </p>
            </fieldset>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="note-review">Review by</Label>
              <Input
                id="note-review"
                type="date"
                value={reviewDueAt}
                onChange={(event) => setReviewDueAt(event.target.value)}
              />
              <p className="text-xs text-[color:var(--text-muted)]">
                Leave it empty for &ldquo;None needed&rdquo;, which is a real answer.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="note-referred">Referred to</Label>
              <Input
                id="note-referred"
                value={referredTo}
                onChange={(event) => setReferredTo(event.target.value)}
                placeholder="Bursar — waiver form"
              />
            </div>
          </div>
        </div>
      </SavingOverlay>
    </RecordDialog>
  );
}
