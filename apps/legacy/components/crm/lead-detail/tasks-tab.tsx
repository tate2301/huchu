"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { Button } from "@corelithzw/ui/components/button";
import { Checkbox } from "@corelithzw/ui/components/checkbox";
import { Input } from "@corelithzw/ui/components/input";
import { Label } from "@corelithzw/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@corelithzw/ui/components/select";
import { ClientDate } from "@corelithzw/ui/components/client-date";
import { useToast } from "@corelithzw/ui/components/use-toast";
import { fetchJson, getApiErrorMessage } from "@corelithzw/platform/api-client";
import { updateCrmFollowUp } from "@/lib/crm/crm-v2";
import { cn } from "@corelithzw/ui/lib/utils";

import type { LeadFilterOwner } from "@/components/crm/leads/leads-filters";
import type { ActivityTarget } from "./activity-composer";
import { isOverdue } from "@/components/crm/leads/stage-config";
import type { LeadFollowUp } from "./lead-types";

/** Sensible default: chase it tomorrow morning rather than "now". */
function defaultDueAt(): string {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(9, 0, 0, 0);
  const offset = tomorrow.getTimezoneOffset() * 60_000;
  return new Date(tomorrow.getTime() - offset).toISOString().slice(0, 16);
}

export function TasksTab({
  target,
  followUps,
  owners,
  currentUserId,
}: {
  target: ActivityTarget;
  followUps: LeadFollowUp[];
  owners: LeadFilterOwner[];
  currentUserId?: string;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [dueAt, setDueAt] = useState(defaultDueAt);
  const [assignedToId, setAssignedToId] = useState(currentUserId ?? "");

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["crm-lead", target.id] });
    queryClient.invalidateQueries({ queryKey: ["crm", target.kind, target.id] });
  };

  // Tasks hang off whichever record the tab is on.
  const targetKey = target.kind === "deal" ? "dealId" : target.kind === "company" ? "clientId" : "leadId";

  const add = useMutation({
    mutationFn: () =>
      fetchJson("/api/v2/crm/follow-ups", {
        method: "POST",
        body: JSON.stringify({
          [targetKey]: target.id,
          title: title.trim(),
          dueAt: new Date(dueAt).toISOString(),
          ...(assignedToId ? { assignedToId } : {}),
        }),
      }),
    onSuccess: () => {
      setTitle("");
      setDueAt(defaultDueAt());
      refresh();
      toast({ title: "Task added" });
    },
    onError: (error) =>
      toast({
        title: "Could not add the task",
        description: getApiErrorMessage(error),
        variant: "destructive",
      }),
  });

  const toggle = useMutation({
    mutationFn: ({ id, done }: { id: string; done: boolean }) =>
      updateCrmFollowUp(id, { status: done ? "COMPLETED" : "PENDING" }),
    onSuccess: refresh,
    onError: (error) =>
      toast({
        title: "Could not update the task",
        description: getApiErrorMessage(error),
        variant: "destructive",
      }),
  });

  const pending = followUps.filter((task) => task.status === "PENDING");
  const closed = followUps.filter((task) => task.status !== "PENDING");

  const renderTask = (task: LeadFollowUp) => {
    const done = task.status === "COMPLETED";
    const overdue = !done && task.status === "PENDING" && isOverdue(task.dueAt);
    return (
      <li key={task.id} className="flex items-start gap-3 py-2.5">
        <Checkbox
          className="mt-0.5"
          checked={done}
          onCheckedChange={(checked) => toggle.mutate({ id: task.id, done: checked === true })}
          aria-label={done ? `Reopen ${task.title}` : `Complete ${task.title}`}
        />
        <div className="min-w-0 flex-1">
          <p className={cn("text-sm", done && "text-[var(--text-muted)] line-through")}>
            {task.title}
          </p>
          {task.notes ? (
            <p className="text-sm text-[var(--text-muted)]">{task.notes}</p>
          ) : null}
          <p
            className={cn(
              "text-sm",
              overdue ? "font-medium text-[var(--status-error-text)]" : "text-[var(--text-muted)]",
            )}
          >
            {overdue ? "Overdue · " : "Due "}
            <ClientDate value={task.dueAt} />
          </p>
        </div>
      </li>
    );
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-2 rounded-[var(--card-radius)] border border-[var(--border)] p-3 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto] sm:items-end">
        <div className="space-y-1.5">
          <Label htmlFor="task-title">Task</Label>
          <Input
            id="task-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="e.g. Call back with the revised price"
            maxLength={200}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="task-due">Due</Label>
          <Input
            id="task-due"
            type="datetime-local"
            value={dueAt}
            onChange={(event) => setDueAt(event.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="task-owner">Owner</Label>
          <Select value={assignedToId} onValueChange={setAssignedToId}>
            <SelectTrigger id="task-owner" className="min-w-36">
              <SelectValue placeholder="Choose" />
            </SelectTrigger>
            <SelectContent>
              {owners.map((owner) => (
                <SelectItem key={owner.id} value={owner.id}>
                  {owner.name ?? "Unnamed"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          onClick={() => add.mutate()}
          disabled={!title.trim() || !dueAt || !assignedToId || add.isPending}
        >
          Add
        </Button>
      </div>

      {followUps.length === 0 ? (
        <p className="py-6 text-center text-sm text-[var(--text-muted)]">
          No tasks here yet. Work goes cold without a next step.
        </p>
      ) : (
        <>
          {pending.length > 0 ? (
            <ul className="divide-y divide-[var(--border)]">{pending.map(renderTask)}</ul>
          ) : (
            <p className="text-sm text-[var(--text-muted)]">
              Nothing outstanding — add the next step so this doesn&apos;t go quiet.
            </p>
          )}

          {closed.length > 0 ? (
            <details className="rounded-[var(--card-radius)] border border-[var(--border)] p-3">
              <summary className="cursor-pointer text-sm text-[var(--text-muted)]">
                {closed.length} completed
              </summary>
              <ul className="mt-2 divide-y divide-[var(--border)]">{closed.map(renderTask)}</ul>
            </details>
          ) : null}
        </>
      )}
    </div>
  );
}
