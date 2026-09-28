"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

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
import { Textarea } from "@/components/ui/textarea";
import { fetchStudentRoll } from "@/lib/schools/students-v2";
import type { MeritKind, MeritReason } from "@/lib/schools/conduct-v2";

/**
 * `Award a merit`, and the demerit the artboard forgot.
 *
 * One dialog for both, because they are one act with a sign: the same pupil,
 * the same reason list filtered by kind, the same points box. Two dialogs would
 * be two places to fix the day somebody wants a note on a merit.
 *
 * The reason is required. A demerit without one is a punishment nobody can
 * explain a term later, and the ledger's whole argument — that a net of −7 says
 * nothing until you read what was recorded — depends on the reason being there.
 */
export function AwardMeritDialog({
  kind,
  onOpenChange,
  reasons,
  isSaving,
  onSubmit,
}: {
  /** Null closes the dialog. */
  kind: MeritKind | null;
  onOpenChange: (open: boolean) => void;
  reasons: MeritReason[];
  isSaving: boolean;
  onSubmit: (values: {
    studentId: string;
    reasonId: string;
    kind: MeritKind;
    points?: number;
    note?: string | null;
  }) => void;
}) {
  const open = kind != null;
  const [studentId, setStudentId] = useState("");
  const [reasonId, setReasonId] = useState("");
  const [points, setPoints] = useState("");
  const [note, setNote] = useState("");
  const [pupilSearch, setPupilSearch] = useState("");

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setStudentId("");
      setReasonId("");
      setPoints("");
      setNote("");
      setPupilSearch("");
    }
  }

  const rollQuery = useQuery({
    queryKey: ["schools", "students", "picker", pupilSearch],
    queryFn: () =>
      fetchStudentRoll({ limit: 25, search: pupilSearch || undefined, status: "ACTIVE" }),
    enabled: open,
  });

  const pupils = rollQuery.data?.data ?? [];
  const forKind = useMemo(
    () => reasons.filter((reason) => reason.kind === kind),
    [reasons, kind],
  );
  const reason = forKind.find((entry) => entry.id === reasonId);
  const canSubmit = studentId.length > 0 && reasonId.length > 0;

  return (
    <RecordDialog
      open={open}
      onOpenChange={onOpenChange}
      title={kind === "DEMERIT" ? "Record a demerit" : "Award a merit"}
      description={
        kind === "DEMERIT"
          ? "A demerit needs a reason. It is read back at prize giving and at a parents' evening."
          : "The cheapest thing a school can give, and the first thing it forgets to write down."
      }
      size="md"
      onSubmit={(event) => {
        event.preventDefault();
        if (!canSubmit || isSaving || !kind) return;
        onSubmit({
          studentId,
          reasonId,
          kind,
          points: points ? Number(points) : undefined,
          note: note.trim() || null,
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
            {isSaving ? "Saving…" : kind === "DEMERIT" ? "Record it" : "Award it"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="merit-pupil-search">Pupil</Label>
          <Input
            id="merit-pupil-search"
            value={pupilSearch}
            onChange={(event) => setPupilSearch(event.target.value)}
            placeholder="Search name or number"
          />
          <Select value={studentId} onValueChange={setStudentId}>
            <SelectTrigger id="merit-pupil">
              <SelectValue
                placeholder={rollQuery.isPending ? "Reading the roll…" : "Pick a pupil"}
              />
            </SelectTrigger>
            <SelectContent>
              {pupils.map((pupil) => (
                <SelectItem key={pupil.id} value={pupil.id}>
                  {pupil.lastName}, {pupil.firstName} · {pupil.studentNo}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="merit-reason">What for</Label>
            <Select value={reasonId} onValueChange={setReasonId}>
              <SelectTrigger id="merit-reason">
                <SelectValue placeholder="Pick a reason" />
              </SelectTrigger>
              <SelectContent>
                {forKind.map((entry) => (
                  <SelectItem key={entry.id} value={entry.id}>
                    {entry.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {forKind.length === 0 ? (
              // It said this and stopped, which leaves the reader holding a
              // true sentence and no next move. Setting them up is a screen,
              // so name it.
              <p className="text-xs text-[color:var(--text-muted)]">
                The school has no {kind === "DEMERIT" ? "demerit" : "merit"} reasons set up
                yet.{" "}
                <Link
                  href="/schools/conduct/setup"
                  className="underline underline-offset-2 hover:text-[color:var(--text-body)]"
                >
                  Set them up
                </Link>
                .
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="merit-points">Points</Label>
            <Input
              id="merit-points"
              type="number"
              min={1}
              max={100}
              value={points}
              onChange={(event) => setPoints(event.target.value)}
              placeholder={reason ? String(reason.defaultPoints) : "1"}
            />
            <p className="text-xs text-[color:var(--text-muted)]">
              {reason
                ? `Leave it empty for the usual ${reason.defaultPoints}.`
                : "Leave it empty for the reason's usual value."}
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="merit-note">Note</Label>
          <Textarea
            id="merit-note"
            value={note}
            rows={2}
            maxLength={500}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Set out the hall for prize giving, unasked"
          />
          <p className="text-xs text-[color:var(--text-muted)]">
            This is what the ledger shows as the last thing recorded. It is the line that tells
            two pupils on the same net apart.
          </p>
        </div>
      </div>
    </RecordDialog>
  );
}
