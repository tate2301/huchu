"use client";

import { useState } from "react";

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

export type StreamFormValues = {
  classId: string;
  code: string;
  name: string;
  capacity: string;
};

/**
 * A stream, created or corrected.
 *
 * There was no way to make one anywhere in the module, and every roll, mark
 * sheet and publish window filters by one — so a school that arrived with no
 * streams could not narrow anything and had no screen that would let it fix
 * that. The class it belongs to is a picker rather than an id box, and it is
 * fixed once the stream exists: moving a stream between year groups would take
 * every pupil in it with it.
 */
export function StreamFormDialog({
  open,
  onOpenChange,
  classes,
  initial,
  defaultClassId,
  isSubmitting,
  error,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  classes: Array<{ id: string; code: string; name: string }>;
  /** The stream being edited. Absent means the dialog is opening a new one. */
  initial?: StreamFormValues;
  /** Which class a *new* stream lands under — the row the verb was pressed on. */
  defaultClassId?: string;
  isSubmitting: boolean;
  error: string | null;
  onSubmit: (values: StreamFormValues) => void;
}) {
  const editing = Boolean(initial);
  const empty: StreamFormValues = {
    classId: defaultClassId || classes[0]?.id || "",
    code: "",
    name: "",
    capacity: "",
  };
  const [values, setValues] = useState<StreamFormValues>(initial ?? empty);

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setValues(initial ?? empty);
  }

  const canSubmit =
    values.classId.length > 0 &&
    values.code.trim().length > 0 &&
    values.name.trim().length > 0;

  return (
    <RecordDialog
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? `Edit ${initial?.name || "stream"}` : "New stream"}
      description="The set a class is split into. Registers, mark sheets and publishing all narrow by one."
      size="md"
      errors={error ? [error] : undefined}
      onSubmit={(event) => {
        event.preventDefault();
        if (canSubmit && !isSubmitting) onSubmit(values);
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
          <Button type="submit" disabled={!canSubmit || isSubmitting}>
            {isSubmitting ? "Saving…" : editing ? "Save the stream" : "Create stream"}
          </Button>
        </div>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="stream-class">Class</Label>
          <Select
            value={values.classId}
            disabled={editing}
            onValueChange={(value) =>
              setValues((current) => ({ ...current, classId: value }))
            }
          >
            <SelectTrigger id="stream-class">
              <SelectValue placeholder="Choose a class" />
            </SelectTrigger>
            <SelectContent>
              {classes.map((row) => (
                <SelectItem key={row.id} value={row.id}>
                  {row.code} - {row.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {editing ? (
            <p className="text-sm text-muted-foreground">
              A stream cannot change year group — every pupil in it would move too.
            </p>
          ) : null}
        </div>
        <div className="space-y-2">
          <Label htmlFor="stream-code">Code</Label>
          <Input
            id="stream-code"
            value={values.code}
            placeholder="2A"
            maxLength={40}
            onChange={(event) =>
              setValues((current) => ({ ...current, code: event.target.value }))
            }
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="stream-name">Name</Label>
          <Input
            id="stream-name"
            value={values.name}
            placeholder="Form 2 Alpha"
            maxLength={120}
            onChange={(event) =>
              setValues((current) => ({ ...current, name: event.target.value }))
            }
          />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="stream-capacity">Places</Label>
          <Input
            id="stream-capacity"
            type="number"
            min={1}
            value={values.capacity}
            placeholder="32"
            onChange={(event) =>
              setValues((current) => ({ ...current, capacity: event.target.value }))
            }
          />
        </div>
      </div>
    </RecordDialog>
  );
}
