"use client";

import { useState, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useToast } from "@corelithzw/ui/components/use-toast";
import { getApiErrorMessage } from "@corelithzw/platform/api-client";
import { updateCrmTask, type CrmTaskRecord } from "@/lib/crm/crm-v2";
import { requiresOutcome } from "@/lib/crm/tasks";

import { CompleteTaskDialog } from "./complete-task-dialog";
import { TaskFormSheet } from "./task-form-sheet";

/**
 * Ticking a task off, and everything that has to happen when you do.
 *
 * This used to live inside `TaskList`, which was fine while the list was the
 * only place a task could be completed. The split view added a second: the
 * detail panel beside the list has the same checkbox, and it has to behave the
 * same way — a call that closes without an outcome teaches nobody anything, and
 * the server refuses the write regardless.
 *
 * Two copies of that would have been two chances to drift, so it is a hook.
 * `toggle` is what a checkbox calls; `dialogs` is the JSX that has to be
 * mounted somewhere for it to work. A surface that renders one without the
 * other gets a checkbox that silently does nothing on typed tasks, so they are
 * returned together from one call rather than as two exports.
 */
export function useTaskCompletion({ currentUserId }: { currentUserId?: string } = {}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [completing, setCompleting] = useState<CrmTaskRecord | null>(null);
  const [followUpFor, setFollowUpFor] = useState<CrmTaskRecord | null>(null);

  const update = useMutation({
    mutationFn: (input: { id: string; body: Record<string, unknown> }) =>
      updateCrmTask(input.id, input.body),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["crm-tasks"] });
      const source = completing;
      setCompleting(null);
      if (result.recurredTask) {
        toast({ title: "Task completed", description: "The next one is booked in." });
      } else if (result.suggestsFollowUp) {
        // The outcome says the conversation isn't over, so offer the next step
        // while the context is still in front of the person.
        setFollowUpFor(source);
      } else {
        toast({ title: "Task completed" });
      }
    },
    onError: (error) => toast({ title: getApiErrorMessage(error), variant: "destructive" }),
  });

  const toggle = (task: CrmTaskRecord) => {
    if (task.status === "COMPLETED") {
      update.mutate({ id: task.id, body: { status: "OPEN", outcome: null } });
      return;
    }
    if (requiresOutcome(task.type)) {
      setCompleting(task);
      return;
    }
    update.mutate({ id: task.id, body: { status: "COMPLETED" } });
  };

  const dialogs: ReactNode = (
    <>
      <CompleteTaskDialog
        task={completing}
        isPending={update.isPending}
        onOpenChange={(open) => !open && setCompleting(null)}
        onConfirm={(input) =>
          completing &&
          update.mutate({ id: completing.id, body: { status: "COMPLETED", ...input } })
        }
      />

      <TaskFormSheet
        open={Boolean(followUpFor)}
        onOpenChange={(open) => !open && setFollowUpFor(null)}
        currentUserId={currentUserId}
        record={
          followUpFor
            ? {
                leadId: followUpFor.leadId ?? undefined,
                dealId: followUpFor.dealId ?? undefined,
                clientId: followUpFor.clientId ?? undefined,
                personId: followUpFor.personId ?? undefined,
                siteId: followUpFor.siteId ?? undefined,
              }
            : undefined
        }
        seed={followUpFor ? { title: followUpFor.title, type: followUpFor.type } : undefined}
        onCreated={() => setFollowUpFor(null)}
      />
    </>
  );

  return { toggle, dialogs, isPending: update.isPending };
}
