"use client";

import { useMemo, useState } from "react";

import { RecordDialog } from "@/components/crm/records/record-dialog";
import { Button } from "@corelithzw/ui/components/button";
import { Checkbox } from "@corelithzw/ui/components/checkbox";
import { Label } from "@corelithzw/ui/components/label";
import {
  STANDARD_SUBJECTS,
  type StandardSubject,
} from "@/components/schools/subjects/standard-subjects";

/**
 * The standard catalogue, put on in one press.
 *
 * A school arriving on the pack has an empty Subjects screen and twenty-two
 * dialogs of typing ahead of it before a single mark sheet can be built. The
 * list it is typing is not its own — Mathematics, English Language, Combined
 * Science, Shona and the rest are the ZIMSEC catalogue — so it is offered
 * here, ticked, with the core ones on by default and everything else there to
 * take or leave.
 *
 * Subjects already on the catalogue are shown and locked rather than hidden:
 * a school running this a second time needs to see that Mathematics is already
 * there, not wonder why it vanished from the list.
 */
export function AddStandardSubjectsDialog({
  open,
  onOpenChange,
  existingCodes,
  existingNames,
  isSubmitting,
  error,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingCodes: string[];
  existingNames: string[];
  isSubmitting: boolean;
  error: string | null;
  onSubmit: (subjects: StandardSubject[]) => void;
}) {
  const taken = useMemo(() => {
    const codes = new Set(existingCodes.map((code) => code.toLowerCase()));
    const names = new Set(existingNames.map((name) => name.toLowerCase()));
    return new Set(
      STANDARD_SUBJECTS.filter(
        (subject) =>
          codes.has(subject.code.toLowerCase()) ||
          names.has(subject.name.toLowerCase()),
      ).map((subject) => subject.code),
    );
  }, [existingCodes, existingNames]);

  const defaults = useMemo(
    () =>
      STANDARD_SUBJECTS.filter(
        (subject) => subject.isCore && !taken.has(subject.code),
      ).map((subject) => subject.code),
    [taken],
  );

  const [chosen, setChosen] = useState<string[]>(defaults);

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setChosen(defaults);
  }

  const toggle = (code: string) =>
    setChosen((current) =>
      current.includes(code)
        ? current.filter((value) => value !== code)
        : [...current, code],
    );

  const selected = STANDARD_SUBJECTS.filter((subject) => chosen.includes(subject.code));

  return (
    <RecordDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Add the standard subjects"
      description="The national catalogue, ticked. Everything here can be renamed, retired or deleted afterwards."
      size="lg"
      errors={error ? [error] : undefined}
      onSubmit={(event) => {
        event.preventDefault();
        if (selected.length > 0 && !isSubmitting) onSubmit(selected);
      }}
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={selected.length === 0 || isSubmitting}>
            {isSubmitting
              ? "Adding…"
              : `Add ${selected.length} subject${selected.length === 1 ? "" : "s"}`}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() =>
              setChosen(
                STANDARD_SUBJECTS.filter((subject) => !taken.has(subject.code)).map(
                  (subject) => subject.code,
                ),
              )
            }
          >
            Tick everything
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setChosen(defaults)}
          >
            Just the core ones
          </Button>
        </div>

        <ul className="grid gap-1 sm:grid-cols-2">
          {STANDARD_SUBJECTS.map((subject) => {
            const already = taken.has(subject.code);
            return (
              <li key={subject.code}>
                <Label className="flex items-center gap-2 rounded-[var(--radius-md)] px-2 py-1.5 hover:bg-[var(--surface-hover)]">
                  <Checkbox
                    checked={already || chosen.includes(subject.code)}
                    disabled={already}
                    onCheckedChange={() => toggle(subject.code)}
                  />
                  <span className="min-w-0 flex-1 truncate text-sm">{subject.name}</span>
                  <span className="font-[family-name:var(--font-mono)] text-sm text-[color:var(--text-muted)]">
                    {subject.code}
                  </span>
                  <span className="text-sm text-[color:var(--text-muted)]">
                    {already
                      ? "already on"
                      : subject.isCore
                        ? `Core · pass ${subject.passMark}`
                        : `Elective · pass ${subject.passMark}`}
                  </span>
                </Label>
              </li>
            );
          })}
        </ul>
      </div>
    </RecordDialog>
  );
}
