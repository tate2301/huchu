"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";

import { Alert, Button, SegmentedControl } from "@corelithzw/react";
import { getApiErrorMessage } from "@/lib/api-client";
import { fetchCrmTasks } from "@/lib/crm/crm-v2";
import { TASK_QUEUE_LABELS, type TaskQueue } from "@/lib/crm/tasks";
import { Plus } from "@corelithzw/ui/lib/icons";

import { TaskFormSheet } from "./task-form-sheet";
import { TaskList } from "./task-list";

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
  TODAY: "Nothing due today. Enjoy it.",
  OVERDUE: "Nothing overdue.",
  UPCOMING: "Nothing booked in yet.",
  MINE: "You have no open tasks.",
  UNASSIGNED: "Every task has an owner.",
  TEAM: "No open tasks across the team.",
  COMPLETED: "Nothing completed yet.",
};

export function TaskQueueContent() {
  const { data: session } = useSession();
  const [queue, setQueue] = useState<TaskQueue>("TODAY");
  const [creating, setCreating] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["crm-tasks", queue],
    queryFn: () => fetchCrmTasks({ queue, limit: 100 }),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl
          options={QUEUES.map((value) => ({ value, label: TASK_QUEUE_LABELS[value] }))}
          value={queue}
          onValueChange={(value) => setQueue(value as TaskQueue)}
          aria-label="Task queue"
        />

        <Button
          variant="primary"
          size="sm"
          startIcon={<Plus className="size-4" />}
          onClick={() => setCreating(true)}
        >
          New task
        </Button>
      </div>

      {error ? (
        <Alert tone="danger" title="Couldn't load tasks">
          {getApiErrorMessage(error)}
        </Alert>
      ) : null}

      <TaskList
        tasks={data?.data ?? []}
        isLoading={isLoading}
        emptyMessage={EMPTY_MESSAGES[queue]}
        currentUserId={session?.user?.id}
      />

      <TaskFormSheet
        open={creating}
        onOpenChange={setCreating}
        currentUserId={session?.user?.id}
      />
    </div>
  );
}
