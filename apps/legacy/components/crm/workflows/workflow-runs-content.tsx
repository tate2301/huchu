"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { Alert, Badge, EmptyState, SegmentedControl, Stack } from "@corelithzw/react";
import { Button } from "@corelithzw/ui/components/button";
import { ClientDate } from "@corelithzw/ui/components/client-date";
import { Skeleton } from "@corelithzw/ui/components/skeleton";
import { PageChrome } from "@corelithzw/ui/layout/page-chrome";
import { fetchJson, getApiErrorMessage } from "@corelithzw/platform/api-client";
import { TRIGGER_LABELS } from "@/lib/crm/automation";
import { REPORT_RANGES, REPORT_RANGE_LABELS, type ReportRange } from "@/lib/crm/reports";
import { Rule } from "@corelithzw/ui/lib/icons";

import { RunInsightsPanel } from "./run-insights-panel";
import { TRIGGER_ICON } from "./workflow-marks";

type RunRow = {
  id: string;
  status: string;
  entity: string;
  recordId: string;
  result: unknown;
  createdAt: string;
  automation: { id: string; name: string; trigger: string } | null;
};

/** Where a run's record lives, so a run is one click from what it changed. */
const ENTITY_HREF: Record<string, (id: string) => string> = {
  LEAD: (id) => `/crm/leads/${id}`,
  DEAL: (id) => `/crm/deals/${id}`,
  PERSON: (id) => `/crm/people/${id}`,
  CLIENT: (id) => `/crm/companies/${id}`,
  SITE: (id) => `/crm/sites/${id}`,
};

/**
 * Why a run did not do what it was meant to.
 *
 * The runner stores its result as a bare array of `{ type, ok, detail }` — one
 * entry per action. This looked for `result.actions[].error`, which is a shape
 * nothing writes, so every failed run rendered with no reason at all: the one
 * thing somebody opens this screen to find out.
 *
 * Named by action, because "Record not found" from three different actions in
 * one rule is three different problems.
 */
function failureMessage(result: unknown): string | null {
  if (!Array.isArray(result)) return null;

  const failures = result
    .filter(
      (outcome): outcome is { type?: unknown; ok?: unknown; detail?: unknown } =>
        Boolean(outcome) && typeof outcome === "object" && outcome.ok === false,
    )
    .map((outcome) => {
      const detail = typeof outcome.detail === "string" ? outcome.detail : "Action failed";
      const type = typeof outcome.type === "string" ? outcome.type : null;
      return type ? `${actionLabel(type)}: ${detail}` : detail;
    });

  return failures.length > 0 ? failures.join(" · ") : null;
}

/** `ADD_TAG` is a database value; "Add tag" is what somebody reads. */
function actionLabel(type: string): string {
  return type
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/^./, (character) => character.toUpperCase());
}

/**
 * What the workflows have actually been doing.
 *
 * The run count next to a rule tells you it fired; it does not tell you what
 * it touched or why the last three attempts failed. This does, because a rule
 * whose failures are only visible as a number is a rule people stop trusting
 * and never fix.
 */
export function WorkflowRunsContent() {
  const [status, setStatus] = useState<"all" | "SUCCEEDED" | "FAILED">("all");
  const [range, setRange] = useState<ReportRange>("30d");

  const { data, isLoading, error } = useQuery({
    queryKey: ["crm-workflow-runs", status],
    queryFn: () =>
      fetchJson<{ data: RunRow[] }>(
        `/api/v2/crm/automations/runs${status === "all" ? "" : `?status=${status}`}`,
      ),
  });

  const runs = data?.data ?? [];

  return (
    <div className="space-y-5">
      <PageChrome title="Workflow activity" />

      <div className="flex flex-wrap items-center justify-between gap-2">
        {/* Six range labels run past 400px together; the control scrolls
            inside its own rail rather than stretching the page. */}
        <div className="scroll-rail max-w-full overflow-x-auto">
          <SegmentedControl
            options={REPORT_RANGES.map((value) => ({ value, label: REPORT_RANGE_LABELS[value] }))}
            value={range}
            onValueChange={(value) => setRange(value as ReportRange)}
            aria-label="Reporting period"
          />
        </div>
      </div>

      <RunInsightsPanel range={range} />

      <h2 className="text-base font-semibold text-[var(--text-strong)]">Every firing</h2>

      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            { value: "all", label: "Everything" },
            { value: "FAILED", label: "Had a problem" },
            { value: "SUCCEEDED", label: "Clean" },
          ] as const
        ).map((option) => (
          <Button
            key={option.value}
            type="button"
            size="sm"
            variant={status === option.value ? "secondary" : "ghost"}
            onClick={() => setStatus(option.value)}
          >
            {option.label}
          </Button>
        ))}
      </div>

      {error ? (
        <Alert tone="danger" title="Couldn't load activity">
          {getApiErrorMessage(error)}
        </Alert>
      ) : null}

      {isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : runs.length === 0 ? (
        <EmptyState
          title="Nothing has run yet"
          body="Once a workflow is live, every firing shows up here with what it touched."
        />
      ) : (
        <Stack as="ul" gap="xs">
          {runs.map((run) => {
            const Icon = run.automation ? TRIGGER_ICON[run.automation.trigger] ?? Rule : Rule;
            const href = ENTITY_HREF[run.entity]?.(run.recordId);
            const failure = run.status === "SUCCEEDED" ? null : failureMessage(run.result);

            return (
              <li key={run.id} className="flex gap-3 rounded-[var(--radius-md)] px-3 py-2.5">
                <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-[var(--surface-subtle)]">
                  <Icon className="size-3.5 text-[var(--text-muted)]" aria-hidden="true" />
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    {run.automation ? (
                      <Link
                        href={`/crm/workflows/${run.automation.id}`}
                        className="text-sm font-medium underline decoration-[var(--border)] underline-offset-2 hover:decoration-[var(--text)]"
                      >
                        {run.automation.name}
                      </Link>
                    ) : (
                      <span className="text-sm font-medium">A deleted workflow</span>
                    )}
                    <Badge tone={run.status === "SUCCEEDED" ? "success" : "danger"}>
                      {run.status === "SUCCEEDED" ? "Ran" : "Had a problem"}
                    </Badge>
                    <span className="text-sm text-[var(--text-subtle)]">
                      <ClientDate value={run.createdAt} mode="datetime" />
                    </span>
                  </div>

                  <p className="text-sm text-[var(--text-muted)]">
                    {run.automation
                      ? TRIGGER_LABELS[
                          run.automation.trigger as keyof typeof TRIGGER_LABELS
                        ] ?? run.automation.trigger
                      : "Trigger unknown"}
                    {" · "}
                    {href ? (
                      <Link
                        href={href}
                        className="underline decoration-[var(--border)] underline-offset-2 hover:decoration-[var(--text)]"
                      >
                        {run.entity.toLowerCase()}
                      </Link>
                    ) : (
                      run.entity.toLowerCase()
                    )}
                  </p>

                  {failure ? (
                    <p className="text-sm text-[var(--status-error-text)]">{failure}</p>
                  ) : null}
                </div>
              </li>
            );
          })}
        </Stack>
      )}
    </div>
  );
}
