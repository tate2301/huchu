"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@corelithzw/ui/components/button";
import { Input } from "@corelithzw/ui/components/input";
import { Label } from "@corelithzw/ui/components/label";
import { Textarea } from "@corelithzw/ui/components/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@corelithzw/ui/components/select";
import { RecordDialog } from "@/components/crm/records/record-dialog";
import {
  RecordPicker,
  recordRefFor,
  type PickedRecord,
} from "@/components/crm/records/record-picker";
import { useToast } from "@corelithzw/ui/components/use-toast";
import { fetchJson, getApiErrorMessage } from "@corelithzw/platform/api-client";
import { createCrmTask, type CrmTaskRecordRef } from "@/lib/crm/crm-v2";
import {
  CRM_TASK_PRIORITY_LABELS,
  CRM_TASK_TYPES,
  CRM_TASK_TYPE_LABELS,
} from "@/lib/crm/tasks";

type TeamResponse = { data: { id: string; name: string | null; email: string }[] };

/** Chase it tomorrow morning rather than "now", which is never when you meant. */
function defaultDueAt(): string {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(9, 0, 0, 0);
  const offset = tomorrow.getTimezoneOffset() * 60_000;
  return new Date(tomorrow.getTime() - offset).toISOString().slice(0, 16);
}

type FormState = {
  title: string;
  description: string;
  type: string;
  priority: string;
  dueAt: string;
  assignedToId: string;
  recurrence: string;
  recurrenceInterval: string;
};

function emptyForm(currentUserId?: string, seed?: Partial<FormState>): FormState {
  return {
    title: "",
    description: "",
    type: "GENERAL",
    priority: "NORMAL",
    dueAt: defaultDueAt(),
    assignedToId: currentUserId ?? "",
    recurrence: "NONE",
    recurrenceInterval: "1",
    ...seed,
  };
}

export function TaskFormSheet({
  open,
  onOpenChange,
  record,
  currentUserId,
  seed,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The record this task belongs to, if it was opened from a record page. */
  record?: CrmTaskRecordRef;
  currentUserId?: string;
  /** Prefill, e.g. when a call ended with "ring them back on Thursday". */
  seed?: Partial<FormState>;
  onCreated?: () => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [form, setForm] = useState<FormState>(() => emptyForm(currentUserId, seed));
  const [about, setAbout] = useState<PickedRecord | null>(null);
  const [errors, setErrors] = useState<string[]>([]);

  // Reset during render as the sheet opens, so there's no flash of the last
  // task's details.
  // Starts at `false`, not `open`: a sheet that mounts already open would
  // otherwise record itself as having always been open, the transition below
  // would never fire, and the form would never seed.
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setForm(emptyForm(currentUserId, seed));
      setAbout(null);
      setErrors([]);
    }
  }

  const { data: team } = useQuery({
    queryKey: ["crm-team"],
    queryFn: () => fetchJson<TeamResponse>("/api/v2/crm/team"),
    staleTime: 5 * 60_000,
  });

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((previous) => ({ ...previous, [key]: value }));

  const create = useMutation({
    mutationFn: () =>
      createCrmTask({
        title: form.title.trim(),
        description: form.description.trim() || null,
        type: form.type,
        priority: form.priority,
        dueAt: new Date(form.dueAt).toISOString(),
        hasDueTime: true,
        assignedToId: form.assignedToId || null,
        recurrence: form.recurrence,
        recurrenceInterval: Number(form.recurrenceInterval) || 1,
        // The record page's own record wins — the picker only appears when
        // there isn't one.
        ...(record ?? recordRefFor(about)),
      }),
    onSuccess: () => {
      toast({ title: "Task created" });
      queryClient.invalidateQueries({ queryKey: ["crm-tasks"] });
      onCreated?.();
      onOpenChange(false);
    },
    onError: (error) => setErrors([getApiErrorMessage(error)]),
  });

  const submit = () => {
    if (!form.title.trim()) {
      setErrors(["Give the task a title so it's clear what needs doing"]);
      return;
    }
    setErrors([]);
    create.mutate();
  };

  return (
    <RecordDialog
      open={open}
      onOpenChange={onOpenChange}
      title="New task"
      description="Pick a type and the task will ask what happened when you complete it."
      errors={errors}
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      footer={
        <>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={create.isPending}>
            {create.isPending ? "Creating…" : "Create task"}
          </Button>
        </>
      }
    >
      <div className="space-y-2">
        <Label htmlFor="task-title">Title</Label>
        <Input
          id="task-title"
          value={form.title}
          onChange={(event) => set("title", event.target.value)}
          placeholder="Call about the revised quote"
        />
      </div>

      {record ? null : (
        <div className="space-y-2">
          <Label htmlFor="task-about">What is this about?</Label>
          <RecordPicker id="task-about" value={about} onChange={setAbout} />
          <p className="text-sm text-[var(--text-muted)]">
            A follow-up nobody can trace back to a deal is a reminder to do
            something unspecified.
          </p>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Type</Label>
          <Select value={form.type} onValueChange={(value) => set("type", value)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CRM_TASK_TYPES.map((type) => (
                <SelectItem key={type} value={type}>
                  {CRM_TASK_TYPE_LABELS[type]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Priority</Label>
          <Select value={form.priority} onValueChange={(value) => set("priority", value)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(CRM_TASK_PRIORITY_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="task-due">Due</Label>
          <Input
            id="task-due"
            type="datetime-local"
            value={form.dueAt}
            onChange={(event) => set("dueAt", event.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label>Assigned to</Label>
          <Select
            value={form.assignedToId}
            onValueChange={(value) => set("assignedToId", value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Unassigned" />
            </SelectTrigger>
            <SelectContent>
              {(team?.data ?? []).map((user) => (
                <SelectItem key={user.id} value={user.id}>
                  {user.name ?? user.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Repeats</Label>
          <Select value={form.recurrence} onValueChange={(value) => set("recurrence", value)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="NONE">Doesn&apos;t repeat</SelectItem>
              <SelectItem value="DAILY">Daily</SelectItem>
              <SelectItem value="WEEKLY">Weekly</SelectItem>
              <SelectItem value="MONTHLY">Monthly</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {form.recurrence !== "NONE" ? (
          <div className="space-y-2">
            <Label htmlFor="task-interval">Every</Label>
            <Input
              id="task-interval"
              type="number"
              min={1}
              max={52}
              value={form.recurrenceInterval}
              onChange={(event) => set("recurrenceInterval", event.target.value)}
            />
            <p className="text-sm text-[var(--text-muted)]">
              The next one is created when you complete this one.
            </p>
          </div>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="task-notes">Notes</Label>
        <Textarea
          id="task-notes"
          rows={3}
          value={form.description}
          onChange={(event) => set("description", event.target.value)}
        />
      </div>
    </RecordDialog>
  );
}
