"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";

import { Alert, Button } from "@corelithzw/react";
import { SegmentedControl } from "@corelithzw/ui/components/segmented-control";
import { PageChrome } from "@corelithzw/ui/layout/page-chrome";
import { ViewToolbar } from "@corelithzw/module-records/components/view-toolbar";
import { fetchJson, getApiErrorMessage } from "@corelithzw/platform/api-client";
import { fetchCrmTasks } from "../../crm-v2";
import { Checklist, Plus } from "@corelithzw/ui/lib/icons";
import { bucketByDueDate } from "@corelithzw/module-records/components/record-list-groups";

import { TaskFormSheet } from "./task-form-sheet";
import { TaskList } from "./task-list";

const PAGE_LIMIT = 200;

type Owner = { id: string; name: string | null };

/**
 * Tasks — the register.
 *
 * Deliberately not the same page as Follow-ups. Follow-ups answers "what do I
 * owe a customer today"; this answers "what is outstanding across the team,
 * and who is holding it". Same rows, different question, so the two are
 * filtered and grouped differently rather than being two doors onto one list:
 * this one is scoped by owner and laid out by when things fall due.
 */
export function TasksRegisterContent() {
  const { data: session } = useSession();
  const [scope, setScope] = useState<"ALL" | "MINE" | "UNASSIGNED">("ALL");
  const [owner, setOwner] = useState<string>("");
  const [creating, setCreating] = useState(false);

  const teamQuery = useQuery({
    queryKey: ["crm", "team"],
    queryFn: () => fetchJson<{ data: Owner[] }>("/api/v2/crm/team"),
    staleTime: 5 * 60 * 1000,
  });

  const tasksQuery = useQuery({
    queryKey: ["crm-tasks", "register", scope, owner],
    queryFn: () =>
      fetchCrmTasks({
        // The scope buttons are the queue; the owner select narrows it further
        // and is meaningless once "Mine" or "Unassigned" has pinned the owner.
        queue: scope === "MINE" ? "MINE" : scope === "UNASSIGNED" ? "UNASSIGNED" : "ALL",
        assignedToId: scope === "ALL" && owner ? owner : undefined,
        limit: PAGE_LIMIT,
      }),
  });

  const tasks = useMemo(() => tasksQuery.data?.data ?? [], [tasksQuery.data]);
  const owners = useMemo(() => teamQuery.data?.data ?? [], [teamQuery.data]);
  const buckets = useMemo(() => bucketByDueDate(tasks, (task) => task.dueAt), [tasks]);

  const actions = useMemo(
    () => (
      <Button
        variant="primary"
        size="sm"
        startIcon={<Plus className="h-4 w-4" />}
        onClick={() => setCreating(true)}
      >
        New task
      </Button>
    ),
    [],
  );

  return (
    // A register of one-line tasks reads as a column; stretched across a wide
    // screen it just puts air between a task and when it is due.
    <div className="max-w-3xl space-y-4">
      <PageChrome title="Tasks" icon={Checklist}>
        {actions}
      </PageChrome>

      <ViewToolbar
        start={
          <>
            <SegmentedControl
              value={scope}
              onValueChange={(value) => setScope(value as typeof scope)}
              options={[
                { value: "ALL", label: "Everyone" },
                { value: "MINE", label: "Mine" },
                { value: "UNASSIGNED", label: "Unassigned" },
              ]}
            />

            {scope === "ALL" ? (
              <select
                value={owner}
                onChange={(event) => setOwner(event.target.value)}
                aria-label="Filter by owner"
                className="h-9 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-2 text-sm"
              >
                <option value="">Any owner</option>
                {owners.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name ?? "Unnamed"}
                  </option>
                ))}
              </select>
            ) : null}
          </>
        }
        end={
          <p className="text-sm text-[var(--text-muted)]">
            <span className="font-mono">{tasks.length}</span> open
          </p>
        }
      />

      {tasksQuery.error ? (
        <Alert tone="danger" title="Unable to load tasks">
          {getApiErrorMessage(tasksQuery.error)}
        </Alert>
      ) : null}

      {buckets
        .filter((bucket) => bucket.items.length > 0 || bucket.id === "today")
        .map((bucket) => (
          <section key={bucket.id} aria-labelledby={`tasks-${bucket.id}`} className="space-y-2">
            <h3
              id={`tasks-${bucket.id}`}
              className="sticky top-14 z-10 flex items-baseline gap-2 bg-[var(--surface-base)] py-1.5 text-base font-semibold text-[var(--text-strong)]"
            >
              <span
                className={
                  bucket.id === "overdue" ? "text-[var(--status-danger-fg)]" : undefined
                }
              >
                {bucket.label}
              </span>
              <span className="font-mono text-sm font-normal text-[var(--text-muted)]">
                {bucket.items.length}
              </span>
            </h3>
            <TaskList
              tasks={bucket.items}
              isLoading={tasksQuery.isLoading}
              emptyMessage="Nothing due today."
              currentUserId={session?.user?.id}
            />
          </section>
        ))}

      <TaskFormSheet open={creating} onOpenChange={setCreating} />
    </div>
  );
}
