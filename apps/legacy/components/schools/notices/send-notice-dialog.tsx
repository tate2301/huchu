"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { RecordDialog } from "@/components/crm/records/record-dialog";
import { FilterSelect } from "@/components/schools/common/filter-select";
import { Button } from "@corelithzw/ui/components/button";
import { Input } from "@corelithzw/ui/components/input";
import { Label } from "@corelithzw/ui/components/label";
import { Textarea } from "@corelithzw/ui/components/textarea";
import { fetchSchoolsClasses } from "@/lib/schools/admin-v2";

export type NoticeDraft = {
  title: string;
  body: string;
  audience: "ALL" | "PARENTS" | "STUDENTS" | "TEACHERS";
  classId: string;
  severity: "INFO" | "WARNING" | "CRITICAL";
  /** Set when this notice puts an earlier one right. See `Correcting`. */
  correctsNoticeId: string | null;
};

/** The notice being put right, as the list knows it. */
export type Correcting = {
  id: string;
  title: string;
  audience: NoticeDraft["audience"];
  classId: string | null;
  severity: NoticeDraft["severity"];
  sentOn: string;
};

const EMPTY: NoticeDraft = {
  title: "",
  body: "",
  audience: "PARENTS",
  classId: "",
  severity: "INFO",
  correctsNoticeId: null,
};

const AUDIENCES = [
  { value: "PARENTS", label: "Parents and guardians" },
  { value: "STUDENTS", label: "Pupils" },
  { value: "TEACHERS", label: "Teachers" },
  { value: "ALL", label: "Everyone" },
];

/**
 * Writing a notice, addressed before it is written.
 *
 * The audience sits above the message on purpose: who this is for changes what
 * you write, and a form that asks last is a form where "Dear parents" gets sent
 * to four hundred pupils. Narrowing to a year group is one more choice, not a
 * different screen, because "the Form 2 parents" is the commonest notice a
 * school sends.
 *
 * There is no draft and no schedule. A notice cannot be recalled once it is
 * out, so the honest interaction is one deliberate Send rather than a save that
 * implies it can be taken back.
 *
 * A correction opens the same dialog with the audience already fixed to the
 * people who got the original. The audience is locked rather than merely
 * pre-filled: a correction that reaches a different set of families than the
 * mistake did leaves some of them holding the wrong version for good.
 */
export function SendNoticeDialog({
  open,
  onOpenChange,
  isSending,
  error,
  onSend,
  correcting,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isSending: boolean;
  error: string | null;
  onSend: (draft: NoticeDraft) => void;
  /** When set, the dialog composes a correction to this notice. */
  correcting?: Correcting | null;
}) {
  const seed = (): NoticeDraft =>
    correcting
      ? {
          title: `Correction — ${correcting.title}`.slice(0, 160),
          body: `This corrects the notice sent on ${correcting.sentOn}, "${correcting.title}".\n\n`,
          audience: correcting.audience,
          classId: correcting.classId ?? "",
          severity: correcting.severity,
          correctsNoticeId: correcting.id,
        }
      : EMPTY;

  const [draft, setDraft] = useState<NoticeDraft>(seed);
  const [wasOpen, setWasOpen] = useState(open);
  const [wasCorrecting, setWasCorrecting] = useState(correcting?.id ?? null);
  if (open !== wasOpen || (correcting?.id ?? null) !== wasCorrecting) {
    setWasOpen(open);
    setWasCorrecting(correcting?.id ?? null);
    if (open) setDraft(seed());
  }

  const classesQuery = useQuery({
    queryKey: ["schools", "classes", "for-notice"],
    queryFn: () => fetchSchoolsClasses({ limit: 100 }),
    enabled: open,
  });
  const classes = classesQuery.data?.data ?? [];

  const locked = Boolean(correcting);
  const ready = draft.title.trim().length > 0 && draft.body.trim().length > 0;

  return (
    <RecordDialog
      open={open}
      onOpenChange={onOpenChange}
      title={correcting ? "Send a correction" : "Send a notice"}
      description={
        correcting
          ? "A notice cannot be recalled. This goes to exactly the people who got the original, and says what changed."
          : "Write to families and staff. A notice appears in the portal straight away and cannot be recalled."
      }
      errors={error ? [error] : undefined}
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSending}>
            Cancel
          </Button>
          <Button onClick={() => onSend(draft)} disabled={!ready || isSending}>
            {isSending ? "Sending…" : correcting ? "Send the correction" : "Send now"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <FilterSelect
            label="Who it is for"
            allLabel="Choose an audience"
            value={draft.audience}
            options={AUDIENCES}
            onChange={(value) =>
              setDraft((current) => ({
                ...current,
                audience: (value || "PARENTS") as NoticeDraft["audience"],
              }))
            }
            className={locked ? "pointer-events-none opacity-60" : undefined}
          />
          <FilterSelect
            label="Year group"
            allLabel="The whole school"
            value={draft.classId}
            options={classes.map((row) => ({ value: row.id, label: row.name }))}
            onChange={(value) => setDraft((current) => ({ ...current, classId: value }))}
            className={locked ? "pointer-events-none opacity-60" : undefined}
          />
        </div>
        <p className="text-[length:var(--type-caption)] text-[color:var(--text-muted)]">
          {locked
            ? "Fixed to the people who got the notice this puts right."
            : draft.classId
              ? draft.audience === "PARENTS"
                ? "Only the parents of pupils in that year group will get this."
                : draft.audience === "STUDENTS"
                  ? "Only pupils in that year group will get this."
                  : draft.audience === "TEACHERS"
                    ? "Only the teachers who teach that year group will get this."
                    : "Only that year group's families and teachers will get this."
              : "Everybody in the chosen audience, across the school."}
        </p>

        <div>
          <Label htmlFor="notice-title">Title</Label>
          <Input
            id="notice-title"
            value={draft.title}
            maxLength={160}
            placeholder="Sports day moved to Friday"
            onChange={(event) =>
              setDraft((current) => ({ ...current, title: event.target.value }))
            }
          />
        </div>

        <div>
          <Label htmlFor="notice-body">Message</Label>
          <Textarea
            id="notice-body"
            rows={6}
            value={draft.body}
            maxLength={4000}
            placeholder="Write it as you would say it at assembly."
            onChange={(event) =>
              setDraft((current) => ({ ...current, body: event.target.value }))
            }
          />
        </div>

        <FilterSelect
          label="Importance"
          allLabel="Normal"
          value={draft.severity === "INFO" ? "" : draft.severity}
          options={[
            { value: "WARNING", label: "Important" },
            { value: "CRITICAL", label: "Urgent" },
          ]}
          onChange={(value) =>
            setDraft((current) => ({
              ...current,
              severity: (value || "INFO") as NoticeDraft["severity"],
            }))
          }
        />
      </div>
    </RecordDialog>
  );
}
