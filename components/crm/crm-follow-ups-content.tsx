"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";

import { Alert, Badge, Button, EmptyState } from "@corelithzw/react";
import { ClientDate } from "@/components/ui/client-date";
import { useToast } from "@/components/ui/use-toast";
import { PageChrome } from "@/components/layout/page-chrome";
import { ListSearch } from "@/components/crm/records/list-search";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { fetchCrmTasks } from "@/lib/crm/crm-v2";
import { TASK_QUEUE_LABELS, type TaskQueue } from "@/lib/crm/tasks";
import { Plus } from "@/lib/icons";

import { TaskFormSheet } from "./tasks/task-form-sheet";
import { TaskList } from "./tasks/task-list";

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

const HEADLINE_QUEUES: TaskQueue[] = ["OVERDUE", "TODAY", "UPCOMING"];

export function CrmFollowUpsContent() {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [queue, setQueue] = useState<TaskQueue>("TODAY");
  const [search, setSearch] = useState("");
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
  const taskRows = useMemo(() => {
    const raw = tasks.data?.data ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return raw;
    return raw.filter((task) =>
      `${task.title} ${task.client?.name ?? ""} ${task.deal?.title ?? ""} ${task.lead?.title ?? ""} ${task.assignedTo?.name ?? ""}`
        .toLowerCase()
        .includes(q),
    );
  }, [tasks.data, search]);

  const overdueCount = headline[0]?.data?.pagination?.total ?? 0;
  const todayCount = headline[1]?.data?.pagination?.total ?? 0;
  const upcomingCount = headline[2]?.data?.pagination?.total ?? 0;

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
    !tasks.isLoading && taskRows.length === 0 && legacyRows.length === 0 && queue === "TODAY" && !search;

  const queueCount = (value: TaskQueue): number | undefined => {
    if (value === "OVERDUE") return overdueCount;
    if (value === "TODAY") return todayCount;
    if (value === "UPCOMING") return upcomingCount;
    if (value === queue) return taskRows.length;
    return undefined;
  };

  return (
    <div className="crm-bk-worksheet">
      <PageChrome title="Follow-ups">
        <Button
          variant="primary"
          size="sm"
          startIcon={<Plus className="size-4" />}
          onClick={() => setCreating(true)}
        >
          New follow-up
        </Button>
      </PageChrome>

      {overdueCount > 0 ? (
        <div className="crm-bk-finding">
          <span className="fl">Overdue</span>
          <span>
            <strong>{overdueCount} customer follow-up{overdueCount === 1 ? " is" : "s are"} overdue</strong> — call, WhatsApp, or email the client today and record the outcome.
          </span>
          {queue !== "OVERDUE" ? (
            <button
              type="button"
              className="fl-act"
              onClick={() => setQueue("OVERDUE")}
            >
              Open overdue queue →
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="crm-bk-tabs-bar" role="tablist" aria-label="Follow-up queue">
        <div className="crm-bk-tabs">
          {QUEUES.map((value) => {
            const cnt = queueCount(value);
            return (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={queue === value}
                data-active={queue === value || undefined}
                onClick={() => setQueue(value)}
                className="crm-bk-tab"
              >
                <span>{TASK_QUEUE_LABELS[value]}</span>
                {cnt !== undefined ? <span className="cnt">{cnt}</span> : null}
              </button>
            );
          })}
        </div>
      </div>

      <div className="crm-bk-tools">
        <ListSearch
          value={search}
          onChange={setSearch}
          placeholder="Search follow-ups by title, client, deal or owner"
        />
        <div className="ml-auto flex items-center gap-2">
          <span className="font-mono text-[11.5px] tabular-nums text-[var(--color-muted)]">
            {taskRows.length} in {TASK_QUEUE_LABELS[queue].toLowerCase()}
          </span>
        </div>
      </div>

      {tasks.error ? (
        <div className="px-5 py-3">
          <Alert tone="danger" title="Couldn't load follow-ups">
            {getApiErrorMessage(tasks.error)}
          </Alert>
        </div>
      ) : null}

      {nothingAtAll ? (
        <div className="px-5 py-8">
          <EmptyState
            title="Nothing to chase today"
            body="Follow-ups raised on a lead, deal, company or site all land here."
            action={
              <Button variant="primary" size="sm" onClick={() => setCreating(true)}>
                Add a follow-up
              </Button>
            }
          />
        </div>
      ) : (
        <TaskList
          tasks={taskRows}
          isLoading={tasks.isLoading}
          emptyMessage={EMPTY_MESSAGES[queue]}
          currentUserId={session?.user?.id}
        />
      )}

      {legacyRows.length ? (
        <section>
          <h3 className="flex items-center gap-2 border-b border-[var(--color-line)] bg-[var(--color-ground)] px-5 py-1.5 text-sm font-medium uppercase tracking-[0.06em] text-[var(--color-muted)]">
            <span>Lead reminders</span>
            <span className="rounded-full bg-[var(--color-surface)] px-1.5 py-0.5 font-mono text-sm font-normal tabular-nums">
              {legacyRows.length}
            </span>
          </h3>
          <ul className="divide-y divide-[var(--color-line)]">
            {legacyRows.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-2.5 transition-colors hover:bg-[var(--color-hover)]"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-[var(--color-ink)]">
                    <Link href={`/crm/tasks/follow-ups/${row.id}`} className="hover:underline">
                      {row.title}
                    </Link>
                    <Badge tone="neutral" size="sm">
                      Lead reminder
                    </Badge>
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[var(--color-muted)]">
                    <span className="font-mono"><ClientDate value={row.dueAt} mode="datetime" /></span>
                    <span>{row.assignedTo?.name ?? "Unassigned"}</span>
                    {row.lead ? (
                      <Link href={`/crm/leads/${row.lead.id}`} className="hover:underline">
                        {row.lead.title ?? row.lead.leadNo}
                      </Link>
                    ) : null}
                    {row.client ? <span>{row.client.name}</span> : null}
                  </div>
                  {row.notes ? (
                    <p className="mt-1 text-sm text-[var(--color-muted)]">{row.notes}</p>
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
          </ul>
        </section>
      ) : null}

      <TaskFormSheet open={creating} onOpenChange={setCreating} currentUserId={session?.user?.id} />
    </div>
  );
}
