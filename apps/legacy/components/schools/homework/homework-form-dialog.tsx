"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Alert, Button } from "@corelithzw/react";

import { Label } from "@corelithzw/ui/components/label";
import { Input } from "@corelithzw/ui/components/input";
import { Textarea } from "@corelithzw/ui/components/textarea";
import { Checkbox } from "@corelithzw/ui/components/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@corelithzw/ui/components/select";
import { RecordDialog } from "@/components/crm/records/record-dialog";
import { getApiErrorMessage } from "@/lib/api-client";
import { fetchTeacherAssignments } from "@/lib/schools/admin-v2";

/**
 * Setting a piece of homework, or correcting one already set.
 *
 * Homework is set against a class-subject — the Form 2A Mathematics that Mrs
 * Nyathi teaches this term — and never against a class alone, because the
 * deadline, the roll and the person who marks it all come from that pairing.
 * So the first field is that pairing, chosen from the term's own assignment
 * list, and there is no free-text class.
 *
 * Publishing is a checkbox rather than a second screen because it is the
 * difference between a note to yourself and a thing thirty-two children can
 * see. Unpublished, the board calls it "Not set yet" — which is the honest
 * label, and the reason draft rows are still on the board at all.
 */

export type HomeworkValues = {
  classSubjectId: string;
  title: string;
  instructions: string;
  /** `YYYY-MM-DD`, or empty for a piece with no deadline. */
  dueOn: string;
  maxScore: string;
  publish: boolean;
};

export type HomeworkTarget = {
  /** Absent when a new piece is being set. */
  id?: string;
  values: HomeworkValues;
  /** "Mathematics · Form 2A" — shown instead of the picker on an edit. */
  describe?: string;
};

export function HomeworkFormDialog({
  open,
  onOpenChange,
  target,
  termId,
  isSubmitting,
  error,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: HomeworkTarget;
  /** Narrows the class-subject list to the term the board is showing. */
  termId: string;
  isSubmitting: boolean;
  error: unknown;
  onSubmit: (values: HomeworkValues) => void;
}) {
  const [values, setValues] = useState<HomeworkValues>(target.values);

  // Reset during render, not in an effect: an effect would paint the previous
  // piece's title for a frame before clearing it.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setValues(target.values);
  }

  const editing = Boolean(target.id);

  const assignmentsQuery = useQuery({
    queryKey: ["schools", "class-subjects", "homework-form", termId],
    queryFn: () =>
      fetchTeacherAssignments({
        page: 1,
        limit: 400,
        isActive: true,
        ...(termId ? { termId } : {}),
      }),
    enabled: open && !editing,
  });

  const options = useMemo(
    () =>
      (assignmentsQuery.data?.data ?? [])
        .map((row) => ({
          value: row.id,
          label: `${row.subject.name} · ${row.class.name}${row.stream ? ` ${row.stream.name}` : ""} · ${row.teacherProfile.user.name}`,
        }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [assignmentsQuery.data],
  );

  const set = (patch: Partial<HomeworkValues>) =>
    setValues((current) => ({ ...current, ...patch }));

  const canSubmit = Boolean(values.classSubjectId && values.title.trim());

  return (
    <RecordDialog
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? "Edit the homework" : "Set homework"}
      description={
        editing
          ? target.describe
          : "Against a subject and a class, so the roll and the marker come with it."
      }
      size="md"
      onSubmit={(event) => {
        event.preventDefault();
        if (canSubmit && !isSubmitting) onSubmit(values);
      }}
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={!canSubmit} loading={isSubmitting}>
            {editing ? "Save the homework" : "Set it"}
          </Button>
        </div>
      }
    >
      {error ? (
        <Alert tone="danger" title="The homework was not saved">
          {getApiErrorMessage(error)}
        </Alert>
      ) : null}

      <div className="space-y-1.5">
        <Label htmlFor="homework-class-subject">Subject and class</Label>
        {editing ? (
          <p className="text-[length:var(--type-body-sm)] font-semibold">
            {target.describe ?? "—"}
          </p>
        ) : (
          <Select
            value={values.classSubjectId}
            onValueChange={(value) => set({ classSubjectId: value })}
          >
            <SelectTrigger id="homework-class-subject" className="w-full">
              <SelectValue
                placeholder={
                  assignmentsQuery.isPending
                    ? "Reading the term's teaching…"
                    : "Choose a subject and class"
                }
              />
            </SelectTrigger>
            <SelectContent>
              {options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {!editing && !assignmentsQuery.isPending && options.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nobody is timetabled to teach anything this term, so there is nothing to set
            homework against. Assign subjects to teachers first.
          </p>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="homework-title">Homework</Label>
        <Input
          id="homework-title"
          value={values.title}
          maxLength={200}
          placeholder="Simultaneous equations, exercise 4"
          onChange={(event) => set({ title: event.target.value })}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="homework-instructions">What they have to do</Label>
        <Textarea
          id="homework-instructions"
          rows={3}
          maxLength={4000}
          value={values.instructions}
          onChange={(event) => set({ instructions: event.target.value })}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="homework-due">Due</Label>
          <Input
            id="homework-due"
            type="date"
            value={values.dueOn}
            onChange={(event) => set({ dueOn: event.target.value })}
          />
          <p className="text-sm text-muted-foreground">
            Leave it empty for work with no deadline. The board says so rather than
            inventing one.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="homework-max">Out of</Label>
          <Input
            id="homework-max"
            type="number"
            min={1}
            max={1000}
            inputMode="numeric"
            value={values.maxScore}
            onChange={(event) => set({ maxScore: event.target.value })}
          />
          <p className="text-sm text-muted-foreground">
            Optional. Only needed where the work carries a mark.
          </p>
        </div>
      </div>

      <label className="flex items-start gap-2">
        <Checkbox
          checked={values.publish}
          onCheckedChange={(checked) => set({ publish: checked === true })}
        />
        <span className="text-[length:var(--type-body-sm)]">
          Publish it
          <span className="block text-[length:var(--type-caption)] text-[color:var(--text-muted)]">
            Until this is on, the class cannot see it and the board reads &ldquo;Not set
            yet&rdquo;.
          </span>
        </span>
      </label>
    </RecordDialog>
  );
}
