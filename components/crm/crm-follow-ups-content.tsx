"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";

import { Alert, Badge, Button, EmptyState, StatCard, Stack } from "@corelithzw/react";
import { ClientDate } from "@/components/ui/client-date";
import { useToast } from "@/components/ui/use-toast";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { ViewToolbar } from "@/components/records/view-toolbar";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { fetchCrmTasks } from "@/lib/crm/crm-v2";
import { TASK_QUEUE_LABELS, type TaskQueue } from "@/lib/crm/tasks";
import { Plus } from "@/lib/icons";

import { TaskFormSheet } from "./tasks/task-form-sheet";
import { TaskList } from "./tasks/task-list";

/**
 * Follow-ups — the "what do I owe someone" queue.
 *
 * This is the same task infrastructure the record pages use, not a second
 * to-do system. It also surfaces the older `CrmFollowUp` rows the lead flow
 * still writes: those pre-date generic tasks and would otherwise be invisible
 * here, which is how this page came to look empty while work was outstanding.
 */

type LegacyFollowUp = {
  id: string;
  title: string;
  dueAt: string;
  status: string;
  notes: string | null;
  lead: { id: string; leadNo: string; title: string | null } | null;
  client: { id: string; name: string } | null;
  assignedTo: { id: string; name: string } | null;
};

const QUEUES: TaskQueue[] = [
  "TODAY",
  "OVERDUE",
  "UPCOMING",
  "MINE",
  "UNASSIGNED",
  "TEAM",
  "COMPLETED",
];

const EMPTY_MESSAGES: Partial<Record<TaskQueue, string>> = {
  TODAY: "Nothing due today.",
  OVERDUE: "Nothing overdue — the queue is clean.",
  UPCOMING: "Nothing booked in yet.",
  MINE: "You have no open follow-ups.",
  UNASSIGNED: "Every follow-up has an owner.",
  TEAM: "No open follow-ups across the team.",
  COMPLETED: "Nothing completed yet.",
};

/** The three counts worth knowing before reading a single row. */
const HEADLINE_QUEUES: TaskQueue[] = ["OVERDUE", "TODAY", "UPCOMING"];

export function CrmFollowUpsContent() {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [queue, setQueue] = useState<TaskQueue>("TODAY");
  const [creating, setCreating] = useState(false);

  const tasks = useQuery({
    queryKey: ["crm-tasks", queue],
    queryFn: () => fetchCrmTasks({ queue, limit: 200 }),
  });

  const headline = useQueries({
    queries: HEADLINE_QUEUES.map((value) => ({
      queryKey: ["crm-tasks", "count", value],
      queryFn: () => fetchCrmTasks({ queue: value, limit: 1 }),
    })),
  });

  const legacy = useQuery({
    queryKey: ["crm-followups-legacy"],
    queryFn: () => fetchJson<{ data: LegacyFollowUp[] }>("/api/v2/crm/follow-ups?status=PENDING"),
  });

  const legacyRows = useMemo(() => legacy.data?.data ?? [], [legacy.data]);
  const taskRows = tasks.data?.data ?? [];

  const completeLegacy = useMutation({
    mutationFn: (id: string) =>
      fetchJson(`/api/v2/crm/follow-ups/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "COMPLETED" }),
      }),
    onSuccess: () => {
      toast({ title: "Follow-up closed" });
      queryClient.invalidateQueries({ queryKey: ["crm-followups-legacy"] });
    },
    onError: (error) => toast({ title: getApiErrorMessage(error), variant: "destructive" }),
  });

  const nothingAtAll =
    !tasks.isLoading && taskRows.length === 0 && legacyRows.length === 0 && queue === "TODAY";

  return (
    <div className="max-w-3xl space-y-4">
      {/* Three counts read as one triptych, so they stay three-up at every
          width — stacked they cost the whole first screen and the queue
          underneath started below the fold. */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        {HEADLINE_QUEUES.map((value, index) => {
          const count = headline[index]?.data?.pagination?.total ?? 0;
          return (
            <StatCard
              key={value}
              label={TASK_QUEUE_LABELS[value]}
              value={count}
              tone={value === "OVERDUE" && count > 0 ? "danger" : "neutral"}
            />
          );
        })}
      </div>

      <ViewToolbar
        start={
          <SegmentedControl
            options={QUEUES.map((value) => ({ value, label: TASK_QUEUE_LABELS[value] }))}
            value={queue}
            onValueChange={(value) => setQueue(value as TaskQueue)}
            ariaLabel="Follow-up queue"
          />
        }
        end={
          <Button
            variant="primary"
            size="sm"
            startIcon={<Plus className="size-4" />}
            onClick={() => setCreating(true)}
          >
            New follow-up
          </Button>
        }
      />

      {tasks.error ? (
        <Alert tone="danger" title="Couldn't load follow-ups">
          {getApiErrorMessage(tasks.error)}
        </Alert>
      ) : null}

      {nothingAtAll ? (
        <EmptyState
          title="Nothing to chase today"
          body="Follow-ups raised on a lead, deal, company or site all land here."
          action={
            <Button variant="primary" size="sm" onClick={() => setCreating(true)}>
              Add a follow-up
            </Button>
          }
        />
      ) : (
        <TaskList
          tasks={taskRows}
          isLoading={tasks.isLoading}
          emptyMessage={EMPTY_MESSAGES[queue]}
          currentUserId={session?.user?.id}
        />
      )}

      {legacyRows.length ? (
        <section className="space-y-2">
          <div>
            <h2 className="text-base font-semibold text-[var(--text-strong)]">Lead reminders</h2>
            <p className="text-sm text-[var(--text-muted)]">
              Raised from a lead before follow-ups became tasks. They behave the
              same way — tick one off when it is done.
            </p>
          </div>
          <Stack as="ul" gap="xs">
            {legacyRows.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
                    {row.title}
                    <Badge tone="neutral" size="sm">
                      Lead reminder
                    </Badge>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[var(--text-muted)]">
                    <ClientDate value={row.dueAt} mode="datetime" />
                    <span>{row.assignedTo?.name ?? "Unassigned"}</span>
                    {row.lead ? (
                      <Link href={`/crm/leads/${row.lead.id}`} className="hover:underline">
                        {row.lead.title ?? row.lead.leadNo}
                      </Link>
                    ) : null}
                    {row.client ? <span>{row.client.name}</span> : null}
                  </div>
                  {row.notes ? (
                    <p className="mt-1 text-sm text-[var(--text-muted)]">{row.notes}</p>
                  ) : null}
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={completeLegacy.isPending}
                  onClick={() => completeLegacy.mutate(row.id)}
                >
                  Done
                </Button>
              </li>
            ))}
          </Stack>
        </section>
      ) : null}

      <TaskFormSheet open={creating} onOpenChange={setCreating} currentUserId={session?.user?.id} />
    </div>
  );
}
