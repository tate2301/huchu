"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";

import { Switch } from "@corelithzw/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { IconButton } from "@/components/ui/icon-button";
import { PageChrome } from "@/components/layout/page-chrome";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import {
  TRIGGER_LABELS,
  type AutomationAction,
  type AutomationCondition,
  type AUTOMATION_TRIGGERS,
} from "@/lib/crm/automation";
import { DotsThree, ArrowRightUp } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { ENTITY_HREF, failureMessage } from "./run-result";

type ScheduledWorkflowRow = {
  id: string;
  name: string;
  trigger: (typeof AUTOMATION_TRIGGERS)[number];
  triggerConfig: { stage?: string; idleDays?: number; entity?: "LEAD" | "DEAL" } | null;
  conditions: AutomationCondition[] | null;
  actions: AutomationAction[];
  isEnabled: boolean;
  runCount: number;
  createdAt: string;
  lastRunAt: string | null;
  runs: { id: string; status: string; createdAt: string }[];
};

type RunRow = {
  id: string;
  status: string;
  entity: string;
  recordId: string;
  result: unknown;
  createdAt: string;
  automation: { id: string; name: string; trigger: string } | null;
};

export function WorkflowsContent() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<"runs" | "scheduled">("runs");

  const scheduledQuery = useQuery({
    queryKey: ["crm-workflows"],
    queryFn: () => fetchJson<{ data: ScheduledWorkflowRow[] }>("/api/v2/crm/automations"),
  });

  const runsQuery = useQuery({
    queryKey: ["crm-workflow-runs"],
    queryFn: () => fetchJson<{ data: RunRow[] }>("/api/v2/crm/automations/runs"),
  });

  const workflows = useMemo(() => scheduledQuery.data?.data ?? [], [scheduledQuery.data]);
  const runs = useMemo(() => runsQuery.data?.data ?? [], [runsQuery.data]);

  const refreshScheduled = () => queryClient.invalidateQueries({ queryKey: ["crm-workflows"] });

  const toggle = useMutation({
    mutationFn: (input: { id: string; isEnabled: boolean }) =>
      fetchJson(`/api/v2/crm/automations/${input.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isEnabled: input.isEnabled }),
      }),
    onSuccess: refreshScheduled,
    onError: (err) => toast({ title: getApiErrorMessage(err), variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => fetchJson(`/api/v2/crm/automations/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({ title: "Workflow deleted" });
      refreshScheduled();
    },
    onError: (err) => toast({ title: getApiErrorMessage(err), variant: "destructive" }),
  });

  const runColumns: ColumnDef<RunRow>[] = useMemo(
    () => [
      {
        accessorKey: "status",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
        cell: ({ row }) => {
          const s = row.original.status;
          if (s === "SUCCEEDED") {
            return <Badge variant="success">Succeeded</Badge>;
          }
          if (s === "FAILED") {
            return <Badge variant="destructive">Failed</Badge>;
          }
          return <Badge variant="outline">{s}</Badge>;
        },
      },
      {
        id: "workflow",
        accessorFn: (row) => row.automation?.name ?? "Unknown",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Workflow" />,
        cell: ({ row }) => {
          const auto = row.original.automation;
          if (!auto) return <span className="text-muted-foreground">—</span>;
          return (
            <Link
              href={`/crm/workflows/${auto.id}`}
              className="font-medium text-[var(--color-ink)] hover:underline"
            >
              {auto.name}
            </Link>
          );
        },
      },
      {
        accessorKey: "entity",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Target" />,
        cell: ({ row }) => {
          const entity = row.original.entity;
          const hrefGen = ENTITY_HREF[entity];
          const href = hrefGen ? hrefGen(row.original.recordId) : null;
          return (
            <div className="flex items-center gap-1.5 text-sm">
              <span className="font-mono text-sm uppercase text-muted-foreground">{entity}</span>
              {href ? (
                <Link
                  href={href}
                  className="inline-flex items-center gap-1 text-[var(--color-ink)] hover:underline"
                >
                  <ArrowRightUp className="size-3.5 text-muted-foreground" />
                </Link>
              ) : null}
            </div>
          );
        },
      },
      {
        accessorKey: "createdAt",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Executed" />,
        cell: ({ row }) => (
          <span className="font-mono text-sm text-muted-foreground">
            {new Date(row.original.createdAt).toLocaleString(undefined, {
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </span>
        ),
      },
      {
        id: "details",
        header: "Details",
        cell: ({ row }) => {
          const fail = failureMessage(row.original.result);
          if (fail) {
            return <span className="text-sm text-[var(--status-error-text)]">{fail}</span>;
          }
          return <span className="text-sm text-muted-foreground">Completed</span>;
        },
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <div className="flex justify-end">
            <Button size="sm" variant="ghost" asChild>
              <Link href={`/crm/workflows/runs/${row.original.id}`}>View</Link>
            </Button>
          </div>
        ),
      },
    ],
    [],
  );

  const scheduledColumns: ColumnDef<ScheduledWorkflowRow>[] = useMemo(
    () => [
      {
        accessorKey: "name",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Workflow" />,
        cell: ({ row }) => (
          <Link
            href={`/crm/workflows/${row.original.id}`}
            className="font-medium text-[var(--color-ink)] hover:underline"
          >
            {row.original.name}
          </Link>
        ),
      },
      {
        accessorKey: "trigger",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Trigger" />,
        cell: ({ row }) => (
          <Badge variant="outline">
            {TRIGGER_LABELS[row.original.trigger] ?? row.original.trigger}
          </Badge>
        ),
      },
      {
        id: "actionsCount",
        header: "Actions",
        accessorFn: (row) => row.actions.length,
        cell: ({ row }) => (
          <span className="font-mono text-sm">{row.original.actions.length}</span>
        ),
      },
      {
        accessorKey: "runCount",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Runs" />,
        cell: ({ row }) => (
          <span className="font-mono text-sm">{row.original.runCount}</span>
        ),
      },
      {
        accessorKey: "lastRunAt",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Last run" />,
        cell: ({ row }) =>
          row.original.lastRunAt ? (
            <span className="font-mono text-sm text-muted-foreground">
              {new Date(row.original.lastRunAt).toLocaleDateString(undefined, {
                dateStyle: "medium",
              })}
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        accessorKey: "isEnabled",
        header: "Live",
        cell: ({ row }) => (
          <Switch
            checked={row.original.isEnabled}
            onChange={() =>
              toggle.mutate({ id: row.original.id, isEnabled: !row.original.isEnabled })
            }
            aria-label={`${row.original.name} is live`}
          />
        ),
      },
      {
        id: "menu",
        header: "",
        cell: ({ row }) => (
          <div className="flex justify-end">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <IconButton size="sm" aria-label={`Options for ${row.original.name}`}>
                  <DotsThree />
                </IconButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem asChild>
                  <Link href={`/crm/workflows/${row.original.id}`}>Open</Link>
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-[var(--status-error-text)]"
                  onClick={() => remove.mutate(row.original.id)}
                >
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ),
      },
    ],
    [toggle, remove],
  );

  return (
    <div className="space-y-0">
      <PageChrome
        title="Workflows"
        primary={{
          label: "New workflow",
          icon: "plus",
          shortcut: "N",
          href: "/crm/workflows/new",
        }}
      />

      <div className="border-b border-[var(--border)] px-6">
        <div className="flex items-center gap-6" role="tablist" aria-label="Workflow tabs">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "runs"}
            onClick={() => setActiveTab("runs")}
            className={cn(
              "pb-3 text-sm font-medium border-b-2 transition-colors",
              activeTab === "runs"
                ? "border-[var(--color-primary)] text-[var(--color-ink)]"
                : "border-transparent text-muted-foreground hover:text-[var(--color-ink)]",
            )}
          >
            Runs
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "scheduled"}
            onClick={() => setActiveTab("scheduled")}
            className={cn(
              "pb-3 text-sm font-medium border-b-2 transition-colors",
              activeTab === "scheduled"
                ? "border-[var(--color-primary)] text-[var(--color-ink)]"
                : "border-transparent text-muted-foreground hover:text-[var(--color-ink)]",
            )}
          >
            Scheduled
          </button>
        </div>
      </div>

      {activeTab === "runs" ? (
        <DataTable
          data={runs}
          columns={runColumns}
          searchPlaceholder="Search runs..."
          exportConfig={{ fileName: "workflow-runs" }}
        />
      ) : (
        <DataTable
          data={workflows}
          columns={scheduledColumns}
          searchPlaceholder="Search scheduled workflows..."
          exportConfig={{ fileName: "scheduled-workflows" }}
        />
      )}
    </div>
  );
}
