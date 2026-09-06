"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import { Alert, Badge, EmptyState, Stack } from "@corelithzw/react";
import { ClientDate } from "@/components/ui/client-date";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { TRIGGER_LABELS } from "@/lib/crm/automation";
import { formatDuration } from "@/lib/crm/run-insights";
import { Rule } from "@/lib/icons";

type EnrolmentRun = {
  id: string;
  status: "SUCCEEDED" | "PARTIAL" | "FAILED";
  result: unknown;
  durationMs: number | null;
  actionCount: number;
  createdAt: string;
  automation: { id: string; name: string; trigger: string } | null;
};

type Enrolment = {
  runs: EnrolmentRun[];
  armed: Array<{ id: string; name: string; trigger: string }>;
};

const STATUS_TONE: Record<EnrolmentRun["status"], "success" | "warn" | "danger"> = {
  SUCCEEDED: "success",
  PARTIAL: "warn",
  FAILED: "danger",
};

const STATUS_LABEL: Record<EnrolmentRun["status"], string> = {
  SUCCEEDED: "Done",
  PARTIAL: "Half done",
  FAILED: "Failed",
};

/** `ADD_TAG` is a database value; "Add tag" is what somebody reads. */
function actionLabel(type: string): string {
  return type
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/^./, (character) => character.toUpperCase());
}

/** What each action did, or why it did not. */
function outcomeLines(result: unknown): Array<{ label: string; ok: boolean; detail?: string }> {
  if (!Array.isArray(result)) return [];
  return result
    .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object")
    .map((entry) => ({
      label: typeof entry.type === "string" ? actionLabel(entry.type) : "Action",
      ok: entry.ok !== false,
      detail: typeof entry.detail === "string" ? entry.detail : undefined,
    }));
}

/**
 * What the workflows have done to this record.
 *
 * "Why is this assigned to somebody I did not pick" had no answer on the page
 * where the question gets asked — the run log was company-wide, so finding one
 * line about this lead meant scrolling past everybody else's.
 *
 * The second list is what could still fire. It is derived, not queued: this
 * engine runs a rule the moment its event happens, so nothing is literally
 * sitting in a pending state, and drawing a spinner next to something that is
 * not running would be a story about a queue that does not exist.
 */
export function AutomationTab({
  entity,
  recordId,
}: {
  entity: "LEAD" | "DEAL" | "PERSON" | "COMPANY" | "SITE" | "WORK_ORDER";
  recordId: string;
}) {
  const query = useQuery({
    queryKey: ["crm-automation-enrolment", entity, recordId],
    queryFn: () =>
      fetchJson<Enrolment>(
        `/api/v2/crm/automations/enrolment?entity=${entity}&recordId=${recordId}`,
      ),
  });

  if (query.isLoading) return <Skeleton className="h-40 w-full" />;

  if (query.error) {
    return (
      <Alert tone="danger" title="Couldn't load what has run">
        {getApiErrorMessage(query.error)}
      </Alert>
    );
  }

  const runs = query.data?.runs ?? [];
  const armed = query.data?.armed ?? [];

  return (
    <div className="space-y-6">
      <section>
        <h3 className="text-base font-semibold text-[var(--text-strong)]">What has run</h3>

        {runs.length === 0 ? (
          <EmptyState
            className="mt-2"
            title="No workflow has touched this yet"
            body="Everything on this record was done by a person."
          />
        ) : (
          <Stack as="ol" gap="sm" className="mt-2">
            {runs.map((run) => {
              const outcomes = outcomeLines(run.result);
              return (
                <li key={run.id} className="border-b border-[var(--border-subtle)] pb-3 last:border-0">
                  <div className="flex flex-wrap items-baseline gap-2">
                    {run.automation ? (
                      <Link
                        href={`/crm/workflows/${run.automation.id}`}
                        className="text-sm font-medium text-[var(--text-strong)] underline decoration-[var(--border)] underline-offset-2"
                      >
                        {run.automation.name}
                      </Link>
                    ) : (
                      <span className="text-sm font-medium text-[var(--text-muted)]">
                        Deleted workflow
                      </span>
                    )}
                    <Badge tone={STATUS_TONE[run.status]}>{STATUS_LABEL[run.status]}</Badge>
                    <span className="text-sm text-[var(--text-muted)]">
                      <ClientDate value={run.createdAt} mode="datetime" />
                      {run.durationMs !== null ? ` · ${formatDuration(run.durationMs)}` : ""}
                    </span>
                  </div>

                  {run.automation ? (
                    <p className="mt-0.5 text-sm text-[var(--text-muted)]">
                      Fired by: {TRIGGER_LABELS[run.automation.trigger as keyof typeof TRIGGER_LABELS] ?? run.automation.trigger}
                    </p>
                  ) : null}

                  {outcomes.length > 0 ? (
                    <ul className="mt-1.5 space-y-0.5">
                      {outcomes.map((outcome, index) => (
                        <li
                          key={index}
                          className={
                            outcome.ok
                              ? "text-sm text-[var(--text)]"
                              : "text-sm text-[var(--status-error-text)]"
                          }
                        >
                          {outcome.label}
                          {outcome.detail ? ` — ${outcome.detail}` : ""}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </Stack>
        )}
      </section>

      <section>
        <h3 className="text-base font-semibold text-[var(--text-strong)]">
          What could still fire
        </h3>
        <p className="mt-0.5 text-sm text-[var(--text-muted)]">
          Enabled workflows pointed at this kind of record. Nothing is queued — each one runs
          the moment the thing it watches for happens.
        </p>

        {armed.length === 0 ? (
          <EmptyState
            className="mt-2"
            icon={<Rule className="size-4" aria-hidden="true" />}
            title="Nothing is watching this record"
          />
        ) : (
          <Stack as="ul" gap="xs" className="mt-2">
            {armed.map((rule) => (
              <li key={rule.id} className="flex flex-wrap items-baseline gap-2">
                <Link
                  href={`/crm/workflows/${rule.id}`}
                  className="text-sm font-medium text-[var(--text-strong)] underline decoration-[var(--border)] underline-offset-2"
                >
                  {rule.name}
                </Link>
                <span className="text-sm text-[var(--text-muted)]">
                  {TRIGGER_LABELS[rule.trigger as keyof typeof TRIGGER_LABELS] ?? rule.trigger}
                </span>
              </li>
            ))}
          </Stack>
        )}
      </section>
    </div>
  );
}
