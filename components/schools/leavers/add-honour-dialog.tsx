"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";

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
import { HONOUR_KIND_LABELS, addHonour, type HonourKind } from "@/lib/schools/leavers-v2";

/**
 * `Record an honour` — what a pupil won while they were here.
 *
 * `SchoolStudentHonour` shipped, is read by the alumnus record, and was written
 * by nothing, so "Prizes and colours" read "None recorded" on every alumnus in
 * every school and there was nowhere to change that.
 *
 * Head girl, head of Nyanga House, full colours for hockey, the accounting
 * prize: this is what a school reads out at prize giving and what somebody
 * writes into a leaving reference four years later, which is the whole reason
 * the alumnus record keeps it.
 *
 * The year is asked for rather than taken from today, because these are
 * recorded in arrears — an office filling in a leaver's record is usually
 * writing down something won two years ago.
 */
export function AddHonourDialog({
  studentId,
  open,
  onOpenChange,
  onSaved,
  defaultYear,
}: {
  studentId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  defaultYear: number;
}) {
  const [kind, setKind] = useState<HonourKind>("POST");
  const [year, setYear] = useState(String(defaultYear));
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () =>
      addHonour(studentId, {
        kind,
        year: Number(year),
        title: title.trim(),
        detail: detail.trim() || null,
      }),
    onSuccess: () => {
      setError(null);
      onSaved();
      onOpenChange(false);
    },
    onError: (cause) => setError(getApiErrorMessage(cause)),
  });

  const ready = title.trim() !== "" && year.length === 4;

  return (
    <RecordDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Record an honour"
      description="A post, colours or a prize. It stays on the pupil's record and prints on their reference."
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
          <Button type="button" disabled={!ready || save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? "Recording…" : "Record it"}
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

        <div className="grid grid-cols-[1fr_110px] gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="honour-kind">What kind</Label>
            <Select value={kind} onValueChange={(value) => setKind(value as HonourKind)}>
              <SelectTrigger id="honour-kind">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(HONOUR_KIND_LABELS) as HonourKind[]).map((value) => (
                  <SelectItem key={value} value={value}>
                    {HONOUR_KIND_LABELS[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="honour-year">Year</Label>
            <Input
              id="honour-year"
              type="number"
              min={1900}
              max={2200}
              value={year}
              onChange={(event) => setYear(event.target.value)}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="honour-title">What it was</Label>
          <Input
            id="honour-title"
            value={title}
            placeholder={
              kind === "POST"
                ? "Head of Nyanga House"
                : kind === "COLOURS"
                  ? "Full colours, hockey"
                  : "Accounting prize"
            }
            onChange={(event) => setTitle(event.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="honour-detail">Anything else</Label>
          <Input
            id="honour-detail"
            value={detail}
            placeholder="Optional"
            onChange={(event) => setDetail(event.target.value)}
          />
        </div>
      </div>
    </RecordDialog>
  );
}
