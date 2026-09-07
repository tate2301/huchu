"use client";

import { useState } from "react";

import { RecordDialog } from "@corelithzw/ui/components/record-dialog";
import { Button } from "@corelithzw/ui/components/button";
import { Checkbox } from "@corelithzw/ui/components/checkbox";
import { Input } from "@corelithzw/ui/components/input";
import { Label } from "@corelithzw/ui/components/label";

export type RoomFormValues = {
  code: string;
  name: string;
  capacity: string;
  kind: string;
  isActive: boolean;
};

const EMPTY: RoomFormValues = {
  code: "",
  name: "",
  capacity: "",
  kind: "",
  isActive: true,
};

/**
 * A teaching room.
 *
 * `kind` is free text rather than an enum because what a school calls its rooms
 * is the school's business — "Lab", "Workshop", "Hall", "Chapel" — and an enum
 * here would need a migration every time somebody built a new block.
 */
export function RoomFormDialog({
  open,
  onOpenChange,
  initial,
  isSubmitting,
  error,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The room being edited. Absent means the dialog is opening a new one. */
  initial?: RoomFormValues;
  isSubmitting: boolean;
  error: string | null;
  onSubmit: (values: RoomFormValues) => void;
}) {
  const editing = Boolean(initial);
  const [values, setValues] = useState<RoomFormValues>(initial ?? EMPTY);

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setValues(initial ?? EMPTY);
  }

  const canSubmit = values.code.trim().length > 0 && values.name.trim().length > 0;

  return (
    <RecordDialog
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? `Edit ${initial?.name || "room"}` : "New room"}
      description="Where a lesson happens. The timetable refuses to put two lessons in one room at once."
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
            {isSubmitting ? "Saving…" : editing ? "Save the room" : "Create room"}
          </Button>
        </div>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="room-code">Code</Label>
          <Input
            id="room-code"
            value={values.code}
            placeholder="B12"
            maxLength={40}
            onChange={(event) =>
              setValues((current) => ({ ...current, code: event.target.value }))
            }
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="room-name">Name</Label>
          <Input
            id="room-name"
            value={values.name}
            placeholder="Block B, Room 12"
            maxLength={120}
            onChange={(event) =>
              setValues((current) => ({ ...current, name: event.target.value }))
            }
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="room-kind">Kind</Label>
          <Input
            id="room-kind"
            value={values.kind}
            placeholder="Classroom, Laboratory, Hall"
            maxLength={60}
            onChange={(event) =>
              setValues((current) => ({ ...current, kind: event.target.value }))
            }
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="room-capacity">Seats</Label>
          <Input
            id="room-capacity"
            type="number"
            min={0}
            value={values.capacity}
            placeholder="36"
            onChange={(event) =>
              setValues((current) => ({ ...current, capacity: event.target.value }))
            }
          />
        </div>
        <div className="sm:col-span-2">
          <Label className="flex items-start gap-2">
            <Checkbox
              checked={values.isActive}
              onCheckedChange={(checked) =>
                setValues((current) => ({ ...current, isActive: checked === true }))
              }
            />
            <span>
              In use
              <span className="block text-muted-foreground">
                Turn this off for a room being rebuilt. Lessons already in it stay
                where they are; nothing new may be put there.
              </span>
            </span>
          </Label>
        </div>
      </div>
    </RecordDialog>
  );
}
