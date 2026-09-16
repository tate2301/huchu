"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Badge } from "@corelithzw/react";

import { RecordDialog } from "@/components/crm/records/record-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getApiErrorMessage } from "@/lib/api-client";
import { correctCandidate, type CandidateRow } from "@/lib/schools/exams-v2";

/**
 * `Fix it` — the correction made where the blocker is drawn.
 *
 * It writes to the **pupil**, not only to the candidate, because that is where
 * the missing fact lives: a birth certificate number belongs to the child, and
 * correcting it on this sitting alone would leave the June resit blocked all
 * over again.
 *
 * `Compare and correct` is the same act with the two names side by side. The
 * certified name is what the board prints; the name on the roll is what the
 * school says. Where they differ, somebody has to decide which is right, and
 * the product's job is to show both rather than to guess.
 */
export function FixCandidateDialog({
  seriesId,
  candidate,
  onOpenChange,
  onSaved,
}: {
  seriesId: string;
  /** Null closes the dialog. */
  candidate: CandidateRow | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const open = candidate != null;
  const [candidateNumber, setCandidateNumber] = useState("");
  const [certifiedName, setCertifiedName] = useState("");
  const [nationalId, setNationalId] = useState("");
  const [birthCertificateNo, setBirthCertificateNo] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [gender, setGender] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open && candidate) {
      setCandidateNumber(candidate.candidateNumber ?? "");
      setCertifiedName(
        candidate.certifiedName ??
          `${candidate.student.firstName} ${candidate.student.lastName}`,
      );
      setNationalId(candidate.student.nationalId ?? "");
      setBirthCertificateNo(candidate.student.birthCertificateNo ?? "");
      setDateOfBirth(candidate.student.dateOfBirth?.slice(0, 10) ?? "");
      setGender(candidate.student.gender ?? "");
      setError(null);
    }
  }

  const save = useMutation({
    mutationFn: () =>
      correctCandidate(seriesId, {
        candidateId: candidate!.id,
        candidateNumber: candidateNumber.trim() || null,
        certifiedName: certifiedName.trim() || null,
        student: {
          nationalId: nationalId.trim() || null,
          birthCertificateNo: birthCertificateNo.trim() || null,
          certifiedName: certifiedName.trim() || null,
          dateOfBirth: dateOfBirth ? new Date(dateOfBirth).toISOString() : null,
          gender: gender.trim() || null,
        },
      }),
    onSuccess: () => {
      setError(null);
      onSaved();
    },
    onError: (mutationError) => setError(getApiErrorMessage(mutationError)),
  });

  const onTheRoll = candidate
    ? `${candidate.student.firstName} ${candidate.student.lastName}`
    : "";
  const differs =
    Boolean(certifiedName.trim()) &&
    certifiedName.trim().toLowerCase() !== onTheRoll.toLowerCase();

  return (
    <RecordDialog
      open={open}
      onOpenChange={onOpenChange}
      title={candidate ? `Correct ${onTheRoll}` : "Correct the candidate"}
      description="What the board's entry file requires. Saved against the pupil, so the next sitting is not blocked by the same gap."
      size="md"
      errors={error ? [error] : undefined}
      onSubmit={(event) => {
        event.preventDefault();
        if (!save.isPending) save.mutate();
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
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save the correction"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {candidate && candidate.blockers.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {candidate.blockers.map((blocker) => (
              <Badge key={blocker} tone="danger">
                {blocker}
              </Badge>
            ))}
          </div>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="fix-cand-no">Candidate number</Label>
            <Input
              id="fix-cand-no"
              value={candidateNumber}
              onChange={(event) => setCandidateNumber(event.target.value)}
              placeholder="0138"
            />
            <p className="text-xs text-[color:var(--text-muted)]">
              Allocated by the school, unique inside this centre and series. Not the pupil
              number.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="fix-certified">Name on the birth certificate</Label>
            <Input
              id="fix-certified"
              value={certifiedName}
              onChange={(event) => setCertifiedName(event.target.value)}
            />
            {differs ? (
              <p className="text-xs text-[color:var(--tone-warn)]">
                The roll says &ldquo;{onTheRoll}&rdquo;. The board prints what it is given —
                decide which is right before the file goes.
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="fix-national-id">National ID</Label>
            <Input
              id="fix-national-id"
              value={nationalId}
              onChange={(event) => setNationalId(event.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="fix-birth-cert">Birth certificate number</Label>
            <Input
              id="fix-birth-cert"
              value={birthCertificateNo}
              onChange={(event) => setBirthCertificateNo(event.target.value)}
            />
            <p className="text-xs text-[color:var(--text-muted)]">
              One of these two is required. Either will do.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="fix-dob">Date of birth</Label>
            <Input
              id="fix-dob"
              type="date"
              value={dateOfBirth}
              onChange={(event) => setDateOfBirth(event.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="fix-sex">Sex</Label>
            <Input
              id="fix-sex"
              value={gender}
              onChange={(event) => setGender(event.target.value)}
              placeholder="F or M"
            />
          </div>
        </div>

        {candidate?.blockers.includes("No photograph") ? (
          <p className="text-xs text-[color:var(--text-muted)]">
            The photograph is set on the pupil&rsquo;s own record — this form cannot take one, and
            a decorative image is not a candidate photograph.
          </p>
        ) : null}
      </div>
    </RecordDialog>
  );
}
