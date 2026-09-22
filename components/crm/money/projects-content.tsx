"use client";

/**
 * Projects, with what each has cost.
 *
 * A list of project names is a list nobody opens twice, so every row carries
 * its own money. Four figures rather than one total, and they are not summed
 * for the reader: committing 200 to somebody and then having them spend it is
 * one 200, and a page that showed 400 would have people cancelling work that
 * is within budget.
 */

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Stack } from "@corelithzw/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { Plus } from "@/lib/icons";

import { formatMoney } from "./money";

export type ProjectCosts = {
  approved: string;
  outstanding: string;
  committed: string;
  spent: string;
  received: string;
  budget: string | null;
  remaining: string | null;
  currency: string;
};

type Project = {
  id: string;
  projectNo: string;
  name: string;
  status: "PLANNING" | "ACTIVE" | "ON_HOLD" | "COMPLETED" | "CANCELLED";
  currency: string;
  client: { id: string; name: string } | null;
  site: { id: string; name: string } | null;
  manager: { id: string; name: string | null } | null;
  costs: ProjectCosts;
};

const FILTERS = [
  { value: "ACTIVE", label: "Active" },
  { value: "PLANNING", label: "Planning" },
  { value: "COMPLETED", label: "Finished" },
  { value: "", label: "All" },
] as const;

export function ProjectsContent() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<string>("ACTIVE");
  const [creating, setCreating] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["crm", "projects", status],
    queryFn: () =>
      fetchJson<{ data: Project[] }>(
        `/api/v2/crm/projects${status ? `?status=${status}` : ""}`,
      ),
  });

  return (
    <Stack gap="md">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SegmentedControl
          ariaLabel="Which projects"
          value={status}
          onValueChange={setStatus}
          options={FILTERS.map((filter) => ({ value: filter.value, label: filter.label }))}
        />
        <Button type="button" size="sm" onClick={() => setCreating(true)}>
          <Plus className="mr-1 h-4 w-4" aria-hidden />
          New project
        </Button>
      </div>

      {isLoading ? <Skeleton className="h-40 w-full" /> : null}

      {data && data.data.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">
          No projects here. Raise one from a job, or start one directly.
        </p>
      ) : null}

      <ul className="grid gap-3 sm:grid-cols-2">
        {(data?.data ?? []).map((project) => (
          <li
            key={project.id}
            className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] p-3"
          >
            <Link href={`/crm/projects/${project.id}`} className="block space-y-2">
              <div>
                <p className="font-medium text-[var(--text-strong)]">{project.name}</p>
                <p className="text-sm text-[var(--text-muted)]">
                  {project.projectNo}
                  {project.client ? ` · ${project.client.name}` : ""}
                  {project.manager?.name ? ` · ${project.manager.name}` : ""}
                </p>
              </div>
              <ProjectCostStrip costs={project.costs} />
            </Link>
          </li>
        ))}
      </ul>

      <CreateSheet
        open={creating}
        onOpenChange={setCreating}
        onCreated={() => {
          setCreating(false);
          queryClient.invalidateQueries({ queryKey: ["crm", "projects"] });
        }}
      />
    </Stack>
  );
}

export function ProjectCostStrip({ costs }: { costs: ProjectCosts }) {
  const overspent =
    costs.budget !== null && Number(costs.remaining) < 0 ? "over budget" : null;

  return (
    <dl className="grid grid-cols-2 gap-x-3 gap-y-1 sm:grid-cols-4">
      <Figure label="Spent" value={formatMoney(costs.spent, costs.currency)} />
      <Figure
        label="Approved, unpaid"
        value={formatMoney(costs.approved, costs.currency)}
      />
      <Figure
        label="Out there"
        value={formatMoney(costs.outstanding, costs.currency)}
      />
      <Figure
        label={costs.budget === null ? "Budget" : overspent ? "Over by" : "Left"}
        value={
          costs.budget === null
            ? "not set"
            : formatMoney(
                overspent ? String(Math.abs(Number(costs.remaining))) : costs.remaining!,
                costs.currency,
              )
        }
        strong
      />
    </dl>
  );
}

function Figure({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <dt className="text-sm text-[var(--text-muted)]">{label}</dt>
      <dd
        className={
          strong
            ? "text-sm font-semibold text-[var(--text-strong)]"
            : "text-sm text-[var(--text-strong)]"
        }
      >
        {value}
      </dd>
    </div>
  );
}

function CreateSheet({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [budget, setBudget] = useState("");

  const create = useMutation({
    mutationFn: () =>
      fetchJson("/api/v2/crm/projects", {
        method: "POST",
        body: JSON.stringify({
          name,
          // Left null rather than sent as zero: nobody has set a budget is not
          // the same as the budget is nothing.
          budget: budget === "" ? null : Number(budget),
          currency: "USD",
        }),
      }),
    onSuccess: () => {
      setName("");
      setBudget("");
      onCreated();
    },
    onError: (error) =>
      toast({ title: "Could not create that", description: getApiErrorMessage(error) }),
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>New project</SheetTitle>
        </SheetHeader>
        <form
          className="mt-4 space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (name.trim()) create.mutate();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="project-name">What is it called</Label>
            <Input
              id="project-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Warehouse floor, phase one"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="project-budget">Budget, if there is one</Label>
            <Input
              id="project-budget"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              value={budget}
              onChange={(event) => setBudget(event.target.value)}
            />
          </div>
          <Button type="submit" className="w-full" disabled={!name.trim() || create.isPending}>
            {create.isPending ? "Creating…" : "Create"}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
