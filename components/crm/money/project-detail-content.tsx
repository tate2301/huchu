"use client";

/**
 * One project: the rollup, and the rows that explain it.
 *
 * A cost figure a manager cannot drill into is a figure they will not trust,
 * and rightly — the first question after "this project has cost 4,200" is
 * always "on what". So both lists are here, under the strip, rather than
 * behind a tab.
 */

import { useQuery } from "@tanstack/react-query";

import { Stack } from "@corelithzw/react";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchJson } from "@/lib/api-client";

import { CATEGORY_LABELS, REQUISITION_STATUS_LABELS, formatMoney, type Category, type RequisitionStatus } from "./money";
import { ProjectCostStrip, type ProjectCosts } from "./projects-content";

type Detail = {
  project: {
    id: string;
    projectNo: string;
    name: string;
    description: string | null;
    status: string;
    currency: string;
    client: { id: string; name: string } | null;
    site: { id: string; name: string } | null;
    manager: { id: string; name: string | null } | null;
    workOrder: { id: string; workOrderNo: string; title: string } | null;
  };
  costs: ProjectCosts;
  requisitions: Array<{
    id: string;
    requisitionNo: string;
    status: RequisitionStatus;
    category: Category;
    purpose: string;
    amount: string;
    approvedAmount: string | null;
    currency: string;
    requestedBy: { id: string; name: string | null } | null;
  }>;
  entries: Array<{
    id: string;
    direction: "RECEIVED" | "SPENT";
    category: Category;
    amount: string;
    currency: string;
    description: string;
    receiptUrl: string | null;
    log: { logDate: string; user: { id: string; name: string | null } } | null;
  }>;
};

export function ProjectDetailContent({ projectId }: { projectId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["crm", "project", projectId],
    queryFn: () => fetchJson<Detail>(`/api/v2/crm/projects/${projectId}`),
  });

  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (!data) return null;

  const { project, costs, requisitions, entries } = data;

  return (
    <Stack gap="lg" className="max-w-3xl">
      <header className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-[var(--text-strong)]">{project.name}</h2>
          <p className="text-sm text-[var(--text-muted)]">
            {project.projectNo}
            {project.client ? ` · ${project.client.name}` : ""}
            {project.site ? ` · ${project.site.name}` : ""}
            {project.manager?.name ? ` · ${project.manager.name}` : ""}
          </p>
        </div>
        <div className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] p-3">
          <ProjectCostStrip costs={costs} />
        </div>
      </header>

      <section className="space-y-2">
        <h3 className="text-base font-semibold text-[var(--text-strong)]">
          Money asked for against this project
        </h3>
        {requisitions.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">Nobody has asked for anything yet.</p>
        ) : (
          <ul className="divide-y divide-[var(--border-subtle)]">
            {requisitions.map((requisition) => (
              <li key={requisition.id} className="flex items-baseline justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm text-[var(--text-strong)]">
                    {requisition.purpose}
                  </p>
                  <p className="text-sm text-[var(--text-muted)]">
                    {requisition.requisitionNo} · {CATEGORY_LABELS[requisition.category]} ·{" "}
                    {requisition.requestedBy?.name ?? "somebody"}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-medium text-[var(--text-strong)]">
                    {formatMoney(
                      requisition.approvedAmount ?? requisition.amount,
                      requisition.currency,
                    )}
                  </p>
                  <p className="text-sm text-[var(--text-muted)]">
                    {REQUISITION_STATUS_LABELS[requisition.status]}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="text-base font-semibold text-[var(--text-strong)]">
          What has actually been spent
        </h3>
        {entries.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">Nothing logged against it yet.</p>
        ) : (
          <ul className="divide-y divide-[var(--border-subtle)]">
            {entries.map((entry) => (
              <li key={entry.id} className="flex items-baseline justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm text-[var(--text-strong)]">{entry.description}</p>
                  <p className="text-sm text-[var(--text-muted)]">
                    {entry.log ? entry.log.logDate.slice(0, 10) : ""}
                    {entry.log?.user?.name ? ` · ${entry.log.user.name}` : ""} ·{" "}
                    {CATEGORY_LABELS[entry.category]}
                    {entry.direction === "SPENT" && !entry.receiptUrl ? " · no receipt" : ""}
                  </p>
                </div>
                <span className="shrink-0 text-sm font-medium text-[var(--text-strong)]">
                  {entry.direction === "RECEIVED" ? "+" : "−"}
                  {formatMoney(entry.amount, entry.currency)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </Stack>
  );
}
