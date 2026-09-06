"use client";

import { useState } from "react";

import { RecordDialog } from "@corelithzw/ui/components/record-dialog";
import { Button } from "@corelithzw/ui/components/button";
import { Input } from "@corelithzw/ui/components/input";
import { Label } from "@corelithzw/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@corelithzw/ui/components/select";

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
/**
 * The four letters a class is usually split into here.
 *
 * A stream’s name is free text and always will be — Blue, Nyathi House,
 * Science — but the overwhelmingly common convention is the class name plus a
 * Greek letter, and typing "Form 2 Gamma" by hand is how "Form 2 Gama" gets
 * onto four hundred registers. Suggested once a class is chosen, never
 * imposed.
 */
const GREEK = ["Alpha", "Beta", "Gamma", "Delta"];

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

  const chosenClass = classes.find((row) => row.id === values.classId);
  const suggestions = chosenClass
    ? GREEK.map((letter, index) => ({
        // "Form 2 Alpha" reading "2A", which is the code every register,
        // mark sheet and publish filter is narrowed by.
        code: `${chosenClass.code.replace(/^[A-Za-z]/, "")}${String.fromCharCode(65 + index)}`,
        name: `${chosenClass.name} ${letter}`,
      }))
    : [];

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
        {editing || suggestions.length === 0 ? null : (
          <div className="space-y-2 sm:col-span-2">
            <Label>Start from</Label>
            <div className="flex flex-wrap gap-2">
              {suggestions.map((suggestion) => (
                <Button
                  key={suggestion.name}
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setValues((current) => ({
                      ...current,
                      code: suggestion.code,
                      name: suggestion.name,
                    }))
                  }
                >
                  {suggestion.name}
                </Button>
              ))}
            </div>
          </div>
        )}
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
